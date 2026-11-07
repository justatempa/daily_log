"use client";

import { useEffect, useState } from "react";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/server/api/root";
import { api } from "@/utils/api";
import { postAiAction } from "@/utils/ai-client";
import { confirm } from "@/components/ui/confirm";

type HistoryRun = inferRouterOutputs<AppRouter>["ai"]["history"]["runs"][number];
type HistoryItem = HistoryRun["items"][number];

const PAGE_SIZE = 10;

const TRIGGER_LABELS: Record<string, string> = {
  AUTO: "自动",
  MANUAL: "手动",
  TEST: "测试",
};

function formatDateTime(value: Date | string | null | undefined) {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString("zh-CN", { hour12: false });
}

function seconds(durationMs: number) {
  return `${(durationMs / 1000).toFixed(1)}s`;
}

/**
 * AI 调用历史：一次总结会包含多个提供商的尝试，服务端按 runId 分组分页，
 * 这里直接渲染每组，避免同一次总结被拆到两页。每组可对目标日期重新生成。
 */
export default function AiHistorySection() {
  const utils = api.useUtils();
  const [page, setPage] = useState(1);
  const [regeneratingDay, setRegeneratingDay] = useState<string | null>(null);
  const [regenerateStatus, setRegenerateStatus] = useState<{
    ok: boolean;
    text: string;
  } | null>(null);

  const historyQuery = api.ai.history.useQuery(
    { page, pageSize: PAGE_SIZE },
    { keepPreviousData: true },
  );

  const data = historyQuery.data;
  const runs = data?.runs ?? [];

  useEffect(() => {
    if (data && page > data.totalPages) {
      setPage(data.totalPages);
    }
  }, [data, page]);

  const onRefresh = () => {
    setPage(1);
    setRegenerateStatus(null);
    void utils.ai.history.invalidate();
  };

  const onRegenerate = async (day: string) => {
    if (regeneratingDay) return;
    if (
      !(await confirm({
        title: `重新生成 ${day} 的 AI 总结？`,
        description:
          "成功后会替换当天已有的 AI 总结；总结时不会包含带 #AI总结 的日志。",
        confirmText: "重新生成",
      }))
    ) {
      return;
    }

    setRegeneratingDay(day);
    setRegenerateStatus(null);
    const result = await postAiAction<{
      providerName: string;
      model: string;
      durationMs: number;
    }>("/api/ai/summarize", { day });
    setRegeneratingDay(null);

    if (result.ok) {
      setRegenerateStatus({
        ok: true,
        text: `已重新生成 ${day} 的总结（${result.data.providerName} · ${(
          result.data.durationMs / 1000
        ).toFixed(1)}s）。`,
      });
      setPage(1);
      await utils.ai.history.invalidate();
      await utils.log.getByDate.invalidate();
    } else {
      const attemptsText =
        result.attempts && result.attempts.length > 0
          ? `\n${result.attempts
              .map(
                (attempt) =>
                  `${attempt.providerName}：${attempt.error ?? "调用失败"}`,
              )
              .join("\n")}`
          : "";
      setRegenerateStatus({
        ok: false,
        text: `${result.error}${attemptsText}`,
      });
      await utils.ai.history.invalidate();
    }
  };

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700/60 dark:bg-slate-800/70">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            AI 调用历史
          </h2>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            按每次调用分页展示，每个提供商的调用结果都记录在这里。
          </p>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          className="shrink-0 rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-600 hover:border-indigo-200 hover:text-indigo-600 dark:border-slate-700 dark:text-slate-300 dark:hover:border-indigo-400 dark:hover:text-indigo-300"
        >
          刷新
        </button>
      </div>

      {regenerateStatus ? (
        <p
          className={`mt-3 whitespace-pre-wrap break-words text-xs ${
            regenerateStatus.ok
              ? "text-emerald-600 dark:text-emerald-400"
              : "text-rose-500 dark:text-rose-400"
          }`}
          role="status"
        >
          {regenerateStatus.text}
        </p>
      ) : null}

      {historyQuery.isLoading ? (
        <p className="mt-4 text-xs text-slate-500 dark:text-slate-400">
          加载中…
        </p>
      ) : runs.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-slate-200 px-4 py-6 text-center text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">
          暂无调用记录。生成一次总结或测试提供商后，这里会显示每次调用的结果。
        </p>
      ) : (
        <div className={`mt-4 space-y-3 ${historyQuery.isFetching ? "opacity-70" : ""}`}>
          {runs.map((run) => {
            const first = run.items[0];
            const targetDay = first?.targetDay ?? null;
            const trigger = first?.trigger ?? "";
            const successItem = run.items.find(
              (item: HistoryItem) => item.status === "SUCCESS",
            );
            const success = Boolean(successItem);
            const isRegenerating = regeneratingDay === targetDay;

            return (
              <div
                key={run.runId}
                className="rounded-2xl border border-slate-200 bg-slate-50/60 p-3 dark:border-slate-700/70 dark:bg-slate-900/30"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-slate-800 dark:text-slate-100">
                      <span className="mr-1.5 rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300">
                        {TRIGGER_LABELS[trigger] ?? trigger}
                      </span>
                      {targetDay ? `总结 ${targetDay}` : "提供商连通性测试"}
                    </p>
                    <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                      {formatDateTime(run.createdAt)} · 尝试 {run.attemptCount} 个提供商
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                    {targetDay ? (
                      <button
                        type="button"
                        onClick={() => void onRegenerate(targetDay)}
                        disabled={regeneratingDay !== null}
                        className="rounded-full border border-indigo-200 px-2.5 py-1 text-[11px] text-indigo-600 transition hover:border-indigo-300 hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-indigo-400/60 dark:text-indigo-300 dark:hover:bg-indigo-500/10"
                      >
                        {isRegenerating ? "重新生成中…" : "重新生成这天"}
                      </button>
                    ) : null}
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                        success
                          ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300"
                          : "bg-rose-50 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300"
                      }`}
                    >
                      {success
                        ? `成功${successItem?.providerName ? ` · ${successItem.providerName}` : ""}`
                        : "失败"}
                    </span>
                  </div>
                </div>

                <div className="mt-2 space-y-1.5">
                  {run.items.map((item: HistoryItem) => (
                    <div
                      key={item.id}
                      className="rounded-xl border border-slate-200 bg-white px-3 py-2 dark:border-slate-700/60 dark:bg-slate-800/70"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-1 text-[11px]">
                        <span className="inline-flex min-w-0 items-center gap-1.5 text-slate-700 dark:text-slate-200">
                          <span
                            className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                              item.status === "SUCCESS"
                                ? "bg-emerald-500"
                                : "bg-rose-500"
                            }`}
                          />
                          <span className="truncate font-medium">
                            {item.providerName}
                          </span>
                          <span className="shrink-0 text-slate-400 dark:text-slate-500">
                            {item.model}
                          </span>
                        </span>
                        <span className="shrink-0 text-slate-400 dark:text-slate-500">
                          {seconds(item.durationMs)}
                        </span>
                      </div>
                      {item.error ? (
                        <p className="mt-1 whitespace-pre-wrap break-words text-[11px] text-rose-500 dark:text-rose-400">
                          {item.error}
                        </p>
                      ) : null}
                      {item.status === "SUCCESS" && item.content ? (
                        <details className="mt-1">
                          <summary className="cursor-pointer text-[11px] text-indigo-600 hover:text-indigo-500 dark:text-indigo-300">
                            查看返回内容（{item.content.length} 字）
                          </summary>
                          <pre className="mt-1 max-h-60 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-slate-50 p-2 text-[11px] leading-relaxed text-slate-700 dark:bg-slate-900/60 dark:text-slate-200">
                            {item.content}
                          </pre>
                        </details>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {data && data.total > 0 ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-3 dark:border-slate-700/60">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            共 {data.total} 组记录 · 第 {page} / {data.totalPages} 页
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              disabled={page <= 1 || historyQuery.isFetching}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-600 transition hover:border-indigo-200 hover:text-indigo-600 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:border-indigo-400 dark:hover:text-indigo-300"
            >
              上一页
            </button>
            <button
              type="button"
              onClick={() => setPage((current) => current + 1)}
              disabled={!data.hasMore || historyQuery.isFetching}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-600 transition hover:border-indigo-200 hover:text-indigo-600 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:border-indigo-400 dark:hover:text-indigo-300"
            >
              下一页
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
