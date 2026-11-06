/**
 * 自动 AI 总结完成后的 Bark 推送。
 *
 * 只在 scheduler 的 AUTO 流程里调用，手动生成不走这里。
 * 通知内容做长度控制：Bark / iOS 通知正文展示有限，正文只放
 * 「提供商 · 耗时」和总结开头的一小段摘要，完整内容在应用里看。
 */

const BARK_GROUP = "daily-log";
const BARK_TIMEOUT_MS = 8_000;
const MAX_TITLE_CHARS = 32;
const MAX_BODY_CHARS = 200;
const MAX_EXCERPT_CHARS = 160;
const MAX_PROVIDER_CHARS = 24;

export type BarkSummaryPayload = {
  title: string;
  body: string;
  group: string;
  url?: string;
};

function truncateChars(value: string, limit: number): string {
  const chars = Array.from(value);
  if (chars.length <= limit) return value;
  if (limit <= 1) return "…";
  return `${chars.slice(0, limit - 1).join("")}…`;
}

/** 去掉少量 Markdown 痕迹并压成单行，避免通知里出现换行/符号噪声 */
function cleanSummary(content: string): string {
  return content
    .replace(/#AI总结/g, "")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\d+[.、)]\s+/gm, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/__(.*?)__/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

/** 取开头一段；尽量在句号/问号/感叹号处截断，避免半句话 */
function buildExcerpt(content: string, limit: number): string {
  const text = cleanSummary(content).replace(/^·\s*/, "");
  if (!text) return "";

  const chars = Array.from(text);
  if (chars.length <= limit) return text;

  const slice = chars.slice(0, limit).join("");
  const punctuation = Math.max(
    slice.lastIndexOf("。"),
    slice.lastIndexOf("！"),
    slice.lastIndexOf("？"),
    slice.lastIndexOf("；"),
  );
  if (punctuation >= Math.floor(limit * 0.5)) {
    return slice.slice(0, punctuation + 1);
  }
  return `${slice}…`;
}

function resolvePushUrl(serverUrl: string): string {
  const value = serverUrl.trim().replace(/\/+$/, "");
  return value.endsWith("/push") ? value : `${value}/push`;
}

export function buildBarkSummaryPayload(params: {
  day: string;
  providerName: string;
  content: string;
  durationMs: number;
  appUrl?: string | null;
}): BarkSummaryPayload {
  const providerName = truncateChars(
    params.providerName.trim() || "AI",
    MAX_PROVIDER_CHARS,
  );
  const duration = `${(params.durationMs / 1000).toFixed(1)}s`;
  const excerpt = buildExcerpt(params.content, MAX_EXCERPT_CHARS);
  const meta = `${providerName} · ${duration}`;
  const body = truncateChars(
    excerpt ? `${meta}\n${excerpt}` : meta,
    MAX_BODY_CHARS,
  );
  const appUrl = params.appUrl?.trim().replace(/\/+$/, "");

  return {
    title: truncateChars(`AI 总结完成 · ${params.day}`, MAX_TITLE_CHARS),
    body,
    group: BARK_GROUP,
    ...(appUrl ? { url: appUrl } : {}),
  };
}

/**
 * 发送 Bark 推送。未配置环境变量时静默跳过；任何失败只记日志，不影响总结结果。
 */
export async function notifyAutoSummaryBark(params: {
  day: string;
  providerName: string;
  content: string;
  durationMs: number;
}): Promise<void> {
  const serverUrl = process.env.BARK_SERVER_URL?.trim();
  const deviceKey = process.env.BARK_DEVICE_KEY?.trim();

  if (!serverUrl || !deviceKey) {
    if (serverUrl || deviceKey) {
      console.warn(
        "[ai-summary] bark skipped: BARK_SERVER_URL and BARK_DEVICE_KEY must both be set",
      );
    }
    return;
  }

  const payload = buildBarkSummaryPayload({
    ...params,
    appUrl: process.env.NEXTAUTH_URL,
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), BARK_TIMEOUT_MS);

  try {
    const response = await fetch(resolvePushUrl(serverUrl), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...payload,
        device_key: deviceKey,
        level: "active",
      }),
      signal: controller.signal,
      cache: "no-store",
    });

    const result = (await response.json().catch(() => null)) as
      | { code?: number; message?: string }
      | null;

    if (
      !response.ok ||
      (typeof result?.code === "number" && result.code !== 200)
    ) {
      console.warn("[ai-summary] bark push failed", {
        status: response.status,
        code: result?.code,
        message: result?.message,
      });
    }
  } catch (error) {
    const message =
      controller.signal.aborted
        ? `请求超时（${BARK_TIMEOUT_MS / 1000} 秒）`
        : error instanceof Error
          ? error.message
          : String(error);
    console.warn("[ai-summary] bark push error", message);
  } finally {
    clearTimeout(timer);
  }
}
