/**
 * AI 动作请求（生成总结 / 测试提供商）走原生 fetch：
 * tRPC 的全局超时默认只有 15s，而一次模型调用可能持续几十秒。
 */

export type AiAttemptFailure = {
  providerName: string;
  error?: string;
};

export type AiRequestResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; attempts?: AiAttemptFailure[] };

export async function postAiAction<T>(
  url: string,
  body: unknown,
  timeoutMs = 240_000,
): Promise<AiRequestResult<T>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const payload = (await response.json().catch(() => null)) as
      | {
          ok?: boolean;
          error?: string;
          attempts?: AiAttemptFailure[];
        }
      | null;

    if (!response.ok || payload?.ok !== true) {
      return {
        ok: false,
        error:
          payload?.error ?? `请求失败（HTTP ${response.status}）`,
        attempts: payload?.attempts,
      };
    }

    return { ok: true, data: payload as unknown as T };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return {
        ok: false,
        error:
          "请求超时。AI 可能仍在后台完成并写入日志，请稍后刷新日志或查看调用历史。",
      };
    }
    return {
      ok: false,
      error: error instanceof Error ? error.message : "网络请求失败",
    };
  } finally {
    clearTimeout(timer);
  }
}
