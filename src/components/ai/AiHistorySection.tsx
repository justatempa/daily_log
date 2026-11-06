"use client";

import { useMemo } from "react";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/server/api/root";
import { api } from "@/utils/api";

type HistoryItem = inferRouterOutputs<AppRouter>["ai"]["history"]["items"][number];

type RunGroup = {
  runId: string;
  items: HistoryItem[];
  createdAt: Date;
  trigger: string;
  targetDay: string | null;
  success: boolean;
  providerName: string | null;
  attemptCount: number;
};

const TRIGGER_LABELS: Record<string, string> = {
  AUTO: "自动",
  MANUAL: "手动",
  TEST: "测试",
};

function formatDateTime(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString("zh-CN", { hour12: false });
}

function seconds(durationMs: number) {
  return `${(durationMs / 1000).toFixed(1)}s`;
}

/**
 * AI 调用历史：一次总结会包含多个提供商的尝试，因此按 runId 分组展示。
 */
export default function AiHistorySection() {
  const utils = api.useUtils();
  const historyQuery = api.ai.history.useInfiniteQuery(
    { pageSize: 20 },
    {
      getNextPageParam: (last) => (last.hasMore ? last.page + 1 : undefined),
    },
  );

  const items = useMemo(
    () => historyQuery.data?.pages.flatMap((page) => page.items) ?? [],
    [historyQuery.data],
  );

  const groups = useMemo<RunGroup[]>(() => {
    const map = new Map<string, HistoryItem[]>();
    for (const item of items) {
      const list = map.get(item.runId);
      if (list) {
        list.push(item);
      } else {
        map.set(item.runId, [item]);
      }
    }
    return Array.from(map.entries()).map(([runId, list]) => {
      const successItem = list.find((item) => item.status === "SUCCESS");
      const first = list[0];
      return {
        runId,
        items: [...list].reverse(),
        createdAt: first.createdAt,
        trigger: first.trigger,
        targetDay: first.targetDay,
        success: Boolean(successItem),
        providerName: successItem?.providerName ?? null,
        attemptCount: list.length,
      };
    });
  }, [items]);

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700/60 dark:bg-slate-800/70">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            AI 调用历史
          </h2>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            每次总结会按顺序尝试启用的提供商，每个提供商的调用结果都记录在这里。
          </p>
        </div>
        <button
          type="button"
          onClick={() => void utils.ai.history.invalidate()}
          className="shrink-0 rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-600 hover:border-indigo-200 hover:text-indigo-600 dark:border-slate-700 dark:text-slate-300 dark:hover:border-indigo-400 dark:hover:text-indigo-300"
        >
          刷新
        </button>
      </div>

      {historyQuery.isLoading ? (
        <p className="mt-4 text-xs text-slate-500 dark:text-slate-400">
          加载中…
        </p>
      ) : groups.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-slate-200 px-4 py-6 text-center text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">
          暂无调用记录。生成一次总结或测试提供商后，这里会显示每次调用的结果。
        </p>
      ) : (
        <div className="mt-4 space-y-3">
          {groups.map((group) => (
            <div
              key={group.runId}
              className="rounded-2xl border border-slate-200 bg-slate-50/60 p-3 dark:border-slate-700/70 dark:bg-slate-900/30"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-slate-800 dark:text-slate-100">
                    <span className="mr-1.5 rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300">
                      {TRIGGER_LABELS[group.trigger] ?? group.trigger}
                    </span>
                    {group.targetDay
                      ? `总结 ${group.targetDay}`
                      : "提供商连通性测试"}
                  </p>
                  <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                    {formatDateTime(group.createdAt)} · 尝试 {group.attemptCount} 个提供商
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                    group.success
                      ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300"
                      : "bg-rose-50 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300"
                  }`}
                >
                  {group.success
                    ? `成功${group.providerName ? ` · ${group.providerName}` : ""}`
                    : "失败"}
                </span>
              </div>

              <div className="mt-2 space-y-1.5">
                {group.items.map((item) => (
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
          ))}
        </div>
      )}

      {historyQuery.hasNextPage ? (
        <button
          type="button"
          onClick={() => void historyQuery.fetchNextPage()}
          disabled={historyQuery.isFetchingNextPage}
          className="mt-3 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-600 transition hover:border-indigo-200 hover:text-indigo-600 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:text-slate-300 dark:hover:border-indigo-400 dark:hover:text-indigo-300"
        >
          {historyQuery.isFetchingNextPage ? "加载中…" : "加载更多"}
        </button>
      ) : null}
    </section>
  );
}
