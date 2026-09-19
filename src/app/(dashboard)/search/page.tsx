"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Timeline, {
  type LogItem,
  type TimelineHandle,
} from "@/components/timeline/Timeline";
import { api } from "@/utils/api";

type SelectedTag = { category: string; label: string };

/** Date -> <input type="date"> 需要的 yyyy-mm-dd */
function toDateInputValue(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function fromDateInputValue(v: string): Date | undefined {
  if (!v) return undefined;
  const d = new Date(v + "T00:00:00");
  return isNaN(d.getTime()) ? undefined : d;
}

type QuickRange = "all" | "today" | "7d" | "30d" | "month";

function quickRangeToDates(range: QuickRange): {
  start: Date | undefined;
  end: Date | undefined;
} {
  const now = new Date();
  if (range === "all") return { start: undefined, end: undefined };
  if (range === "today") return { start: now, end: now };
  if (range === "7d") {
    const start = new Date(now);
    start.setDate(start.getDate() - 6);
    return { start, end: now };
  }
  if (range === "30d") {
    const start = new Date(now);
    start.setDate(start.getDate() - 29);
    return { start, end: now };
  }
  // month
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  return { start, end: now };
}

const QUICK_OPTIONS: { key: QuickRange; label: string }[] = [
  { key: "all", label: "全部" },
  { key: "today", label: "今天" },
  { key: "7d", label: "近7天" },
  { key: "30d", label: "近30天" },
  { key: "month", label: "本月" },
];

export default function SearchPage() {
  const [keyword, setKeyword] = useState("");
  const [debouncedKeyword, setDebouncedKeyword] = useState("");
  const [selectedTags, setSelectedTags] = useState<SelectedTag[]>([]);
  const [quickRange, setQuickRange] = useState<QuickRange>("all");
  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);
  const timelineRef = useRef<TimelineHandle | null>(null);

  const utils = api.useUtils();

  // 关键字防抖 300ms
  useEffect(() => {
    const t = setTimeout(() => setDebouncedKeyword(keyword.trim()), 300);
    return () => clearTimeout(t);
  }, [keyword]);

  const { data: availableTags } = api.quickTag.getGrouped.useQuery();

  const searchParams = useMemo(
    () => ({
      keyword: debouncedKeyword || undefined,
      selectedTags: selectedTags.length > 0 ? selectedTags : undefined,
      startDate,
      endDate,
    }),
    [debouncedKeyword, selectedTags, startDate, endDate],
  );

  const { data: results, isFetching } = api.log.search.useQuery(searchParams, {
    // 条件变化时自动重新查询
    keepPreviousData: true,
  });

  const toggleTodo = api.log.toggleTodo.useMutation({
    onSuccess: () => utils.log.search.invalidate(),
  });
  const deleteLog = api.log.delete.useMutation({
    onSuccess: () => utils.log.search.invalidate(),
  });
  const updateLog = api.log.update.useMutation({
    onSuccess: () => utils.log.search.invalidate(),
  });
  const addLog = api.log.add.useMutation({
    onSuccess: () => utils.log.search.invalidate(),
  });

  const logs: LogItem[] = useMemo(
    () =>
      (results ?? []).map((log) => ({
        id: log.id,
        content: log.content,
        date: new Date(log.date),
        tags: log.tags,
        isTodo: log.isTodo,
        isTodoDone: log.isTodoDone,
        replies: log.replies?.map((r) => ({
          id: r.id,
          content: r.content,
          date: new Date(r.date),
        })),
      })),
    [results],
  );

  const handleQuickRange = (range: QuickRange) => {
    setQuickRange(range);
    const { start, end } = quickRangeToDates(range);
    setStartDate(start);
    setEndDate(end);
  };

  const handleStartDateChange = (v: string) => {
    setQuickRange("all");
    setStartDate(fromDateInputValue(v));
  };
  const handleEndDateChange = (v: string) => {
    setQuickRange("all");
    setEndDate(fromDateInputValue(v));
  };

  const toggleTag = (category: string, label: string) => {
    setSelectedTags((prev) => {
      const exists = prev.some(
        (item) => item.category === category && item.label === label,
      );
      if (exists) {
        return prev.filter(
          (item) => item.category !== category || item.label !== label,
        );
      }
      return [...prev, { category, label }];
    });
  };

  const clearAll = () => {
    setKeyword("");
    setDebouncedKeyword("");
    setSelectedTags([]);
    setQuickRange("all");
    setStartDate(undefined);
    setEndDate(undefined);
  };

  const hasFilter =
    !!debouncedKeyword ||
    selectedTags.length > 0 ||
    startDate !== undefined ||
    endDate !== undefined;

  return (
    <div className="space-y-6">
      {/* 搜索条件面板 */}
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-indigo-500">
              Search
            </p>
            <h2 className="mt-2 text-xl font-semibold text-slate-900">
              全局搜索
            </h2>
          </div>
          {hasFilter ? (
            <button
              type="button"
              onClick={clearAll}
              className="rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-500 hover:border-rose-200 hover:text-rose-500"
            >
              清空条件
            </button>
          ) : null}
        </div>

        {/* 关键字 */}
        <div className="mt-4">
          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="输入内容关键字..."
            className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
          />
        </div>

        {/* 时间范围 */}
        <div className="mt-4">
          <p className="mb-2 text-xs font-semibold text-slate-500">时间范围</p>
          <div className="flex flex-wrap items-center gap-2">
            {QUICK_OPTIONS.map((opt) => (
              <button
                key={opt.key}
                type="button"
                onClick={() => handleQuickRange(opt.key)}
                className={`rounded-full px-3 py-1 text-xs transition ${
                  quickRange === opt.key
                    ? "bg-indigo-500 text-white shadow-sm"
                    : "border border-slate-200 text-slate-500 hover:border-indigo-200 hover:text-indigo-600"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <input
              type="date"
              value={startDate ? toDateInputValue(startDate) : ""}
              onChange={(e) => handleStartDateChange(e.target.value)}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-200"
            />
            <span>至</span>
            <input
              type="date"
              value={endDate ? toDateInputValue(endDate) : ""}
              onChange={(e) => handleEndDateChange(e.target.value)}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-200"
            />
          </div>
        </div>

        {/* 标签筛选 */}
        <div className="mt-4 border-t border-slate-100 pt-4">
          <p className="mb-2 text-xs font-semibold text-slate-500">
            标签筛选
            {selectedTags.length > 0 ? (
              <span className="ml-2 text-indigo-500">
                已选 {selectedTags.length} 个
              </span>
            ) : null}
          </p>
          {availableTags && Object.keys(availableTags).length > 0 ? (
            <div className="space-y-3">
              {Object.entries(availableTags).map(([category, labels]) => (
                <div key={category}>
                  <p className="text-xs text-slate-400">{category}</p>
                  <div className="mt-1.5 flex flex-wrap gap-2">
                    {labels.map((label) => {
                      const isSelected = selectedTags.some(
                        (item) =>
                          item.category === category && item.label === label,
                      );
                      return (
                        <button
                          key={`${category}-${label}`}
                          type="button"
                          onClick={() => toggleTag(category, label)}
                          className={`rounded-full border px-3 py-1 text-xs transition ${
                            isSelected
                              ? "border-indigo-500 bg-indigo-50 text-indigo-600"
                              : "border-slate-200 text-slate-500 hover:border-indigo-200"
                          }`}
                        >
                          {category}: {label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-400">
              暂无标签，可先在 Dashboard 的 Quick Input 中添加
            </p>
          )}
        </div>
      </div>

      {/* 结果统计 */}
      <div className="flex items-center justify-between px-1 text-xs text-slate-400">
        <span>
          {isFetching ? "搜索中..." : `共 ${logs.length} 条结果`}
        </span>
      </div>

      {/* 结果列表 */}
      {logs.length > 0 ? (
        <Timeline
          ref={timelineRef}
          logs={logs}
          reverseSort
          showDate
          onToggleTodo={(id) => toggleTodo.mutate({ id })}
          onDelete={(id) => deleteLog.mutate({ id })}
          onUpdate={(id, content) => updateLog.mutate({ id, content })}
          onUpdateTags={(id, tags) => updateLog.mutate({ id, tags })}
          onAddReply={(id, content) =>
            addLog.mutate({
              content,
              date: new Date(),
              parentId: id,
              tags: "",
            })
          }
          onResend={() => {}}
          scrollToBottomKey={0}
        />
      ) : (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white p-10 text-center text-slate-400">
          <p className="text-sm uppercase tracking-[0.3em]">
            {isFetching ? "..." : hasFilter ? "无匹配结果" : "输入条件开始搜索"}
          </p>
        </div>
      )}
    </div>
  );
}
