/**
 * Next.js 启动钩子：确保 AI 表结构存在，并启动每日总结调度器。
 * 只在 Node.js runtime 执行（边缘 runtime 不加载 Prisma）。
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  try {
    const { ensureAiSchema } = await import("./server/ai/ensure-schema");
    await ensureAiSchema();
    console.log("[ai-summary] schema ensured");
  } catch (error) {
    console.error("[ai-summary] schema ensure failed", error);
  }

  try {
    const { startAiSummaryScheduler } = await import("./server/ai/scheduler");
    startAiSummaryScheduler();
  } catch (error) {
    console.error("[ai-summary] scheduler start failed", error);
  }
}
