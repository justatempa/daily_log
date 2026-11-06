/**
 * OpenAI 兼容的 Chat Completions 调用封装。
 *
 * 只支持一个提供商一个模型；所有提供商共用同一套请求格式，
 * 地址、Key、模型均来自 AiProvider 配置。
 */

export type ChatMessage = {
  role: "system" | "user";
  content: string;
};

export type ProviderConfig = {
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
};

export type ChatResult = {
  content: string;
  durationMs: number;
};

const DEFAULT_TIMEOUT_MS = 60_000;

/** 把用户填写的接口根地址补全为 /chat/completions 地址 */
export function resolveChatEndpoint(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, "");
  if (!trimmed) {
    throw new Error("接口地址为空");
  }
  if (/\/chat\/completions$/i.test(trimmed)) {
    return trimmed;
  }
  const lastSegment = trimmed.split("/").pop() ?? "";
  // 已经带了版本段（/v1、/v4、/compatible-mode/v1 等）时只补 /chat/completions
  if (/^v\d(\.\d+)?$/i.test(lastSegment)) {
    return `${trimmed}/chat/completions`;
  }
  return `${trimmed}/v1/chat/completions`;
}

function truncate(text: string, limit: number): string {
  const value = text.trim();
  if (value.length <= limit) return value;
  return `${value.slice(0, limit)}…`;
}

function extractContent(payload: unknown): string {
  const data = payload as {
    choices?: Array<{
      message?: { content?: unknown };
      text?: unknown;
    }>;
  };
  const first = data?.choices?.[0];
  const raw = first?.message?.content ?? first?.text;
  let content = "";
  if (typeof raw === "string") {
    content = raw;
  } else if (Array.isArray(raw)) {
    content = raw
      .map((part) => {
        if (typeof part === "string") return part;
        if (part && typeof part === "object" && "text" in part) {
          const value = (part as { text?: unknown }).text;
          return typeof value === "string" ? value : "";
        }
        return "";
      })
      .join("");
  }
  return content.trim();
}

async function readErrorMessage(response: Response): Promise<string> {
  let body = "";
  try {
    body = await response.text();
  } catch {
    // ignore
  }
  let detail = body;
  try {
    const parsed = JSON.parse(body) as {
      error?: { message?: unknown };
      message?: unknown;
    };
    const message = parsed?.error?.message ?? parsed?.message;
    if (typeof message === "string" && message.trim()) {
      detail = message;
    }
  } catch {
    // 非 JSON，保留原文
  }
  const suffix = detail.trim() ? `：${truncate(detail, 300)}` : "";
  return `HTTP ${response.status}${suffix}`;
}

/**
 * 调用一次 Chat Completions，失败时抛出带可读原因的错误。
 * 超时、网络错误、非 2xx、空回复都会抛错，由上层继续尝试下一个提供商。
 */
export async function callChatCompletion(params: {
  provider: ProviderConfig;
  messages: ChatMessage[];
  temperature?: number;
  timeoutMs?: number;
}): Promise<ChatResult> {
  const { provider } = params;
  const endpoint = resolveChatEndpoint(provider.baseUrl);
  const timeoutMs = params.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = Date.now();

  try {
    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer ${provider.apiKey.trim()}`,
        },
        body: JSON.stringify({
          model: provider.model,
          messages: params.messages,
          temperature: params.temperature ?? 0.4,
          stream: false,
        }),
        signal: controller.signal,
        cache: "no-store",
      });
    } catch (error) {
      if (controller.signal.aborted) {
        throw new Error(`请求超时（${Math.round(timeoutMs / 1000)} 秒）`);
      }
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(`网络请求失败：${reason}`);
    }

    if (!response.ok) {
      throw new Error(await readErrorMessage(response));
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new Error("接口返回的不是合法 JSON");
    }

    const content = extractContent(payload);
    if (!content) {
      throw new Error("模型返回内容为空");
    }

    return { content, durationMs: Date.now() - startedAt };
  } finally {
    clearTimeout(timer);
  }
}
