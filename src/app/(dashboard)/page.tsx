"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import Calendar from "@/components/calendar/Calendar";
import Timeline, {
  type LogItem,
  type TimelineHandle,
} from "@/components/timeline/Timeline";
import QuickInput, { type QuickInputHandle } from "@/components/quick-input/QuickInput";
import { api } from "@/utils/api";
import { useIsMobile } from "@/utils/use-media-query";
import {
  formatTagGroups,
  parseTagGroups,
  serializeTagGroups,
  type TagGroup,
} from "@/utils/tags";

type PendingLog = {
  id: string;
  content: string;
  date: Date;
  tags: string;
  isTodo: boolean;
  status: "sending" | "failed";
};

function sameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function newTempId() {
  return `temp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export default function DashboardPage() {
  const isMobile = useIsMobile();
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [message, setMessage] = useState("");
  const [memosStatus, setMemosStatus] = useState<string | null>(null);
  const [isTodo, setIsTodo] = useState(false);
  const [filter, setFilter] = useState<"all" | "todo" | "todo_open">("all");
  const [scrollToken, setScrollToken] = useState(0);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [quickTags, setQuickTags] = useState<TagGroup[]>([]);
  const [pendingLogs, setPendingLogs] = useState<PendingLog[]>([]);
  const [privacyMode, setPrivacyMode] = useState(false);
  // 移动端：日历 / 标签面板默认隐藏，按钮触发
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [tagsOpen, setTagsOpen] = useState(false);
  const timelineRef = useRef<TimelineHandle | null>(null);
  const quickInputRef = useRef<QuickInputHandle | null>(null);
  const mobileInputRef = useRef<HTMLTextAreaElement | null>(null);

  // 本地时区的当日区间（start=当日 00:00，end=次日 00:00），
  // 由浏览器本地时区定义，服务端不再做时区换算
  const dayRange = useMemo(() => {
    const start = new Date(selectedDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return { start, end };
  }, [selectedDate]);

  const logsQuery = api.log.getByDate.useQuery(dayRange);
  const memosQuery = api.setting.getMemosToken.useQuery();
  const utils = api.useUtils();
  const addLog = api.log.add.useMutation();
  const toggleTodo = api.log.toggleTodo.useMutation({
    onSuccess: async () => {
      await logsQuery.refetch();
    },
  });
  const deleteLog = api.log.delete.useMutation({
    onSuccess: async () => {
      await logsQuery.refetch();
    },
  });
  const updateLog = api.log.update.useMutation({
    onSuccess: async () => {
      await logsQuery.refetch();
    },
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = () => {
      setShowScrollTop(window.scrollY > 240);
    };
    handler();
    window.addEventListener("scroll", handler);
    return () => window.removeEventListener("scroll", handler);
  }, []);

  const dateLabel = useMemo(
    () =>
      selectedDate.toLocaleDateString("zh-CN", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      }),
    [selectedDate],
  );

  // 移动端日期栏：短日期 + 前后一天切换
  const mobileDateLabel = useMemo(
    () =>
      selectedDate.toLocaleDateString("zh-CN", {
        month: "long",
        day: "numeric",
        weekday: "short",
      }),
    [selectedDate],
  );
  const isToday = useMemo(() => sameDay(selectedDate, new Date()), [selectedDate]);

  const shiftDay = (delta: number) => {
    const next = new Date(selectedDate);
    next.setDate(next.getDate() + delta);
    setSelectedDate(next);
  };

  const goToday = () => setSelectedDate(new Date());

  const sendLog = (pending: PendingLog) => {
    addLog.mutate(
      {
        content: pending.content,
        date: pending.date,
        tags: pending.tags,
        isTodo: pending.isTodo,
      },
      {
        onSuccess: (created) => {
          // 用真实数据替换临时条目，避免等待 refetch 造成闪烁
          setPendingLogs((prev) =>
            prev.filter((item) => item.id !== pending.id),
          );
          // 乐观更新按「日志实际所在日期」（本地时区）写入缓存，
          // 与发送时选中的日历日期无关
          const dayStart = new Date(pending.date);
          dayStart.setHours(0, 0, 0, 0);
          const dayEnd = new Date(dayStart);
          dayEnd.setDate(dayEnd.getDate() + 1);
          utils.log.getByDate.setData(
            { start: dayStart, end: dayEnd },
            (old) => {
              const list = old ?? [];
              return [
                ...list,
                {
                  ...created,
                  date: new Date(created.date),
                  replies: [],
                },
              ].sort((a, b) => a.date.getTime() - b.date.getTime());
            },
          );
          setScrollToken((value) => value + 1);
        },
        onError: () => {
          setPendingLogs((prev) =>
            prev.map((item) =>
              item.id === pending.id
                ? { ...item, status: "failed" as const }
                : item,
            ),
          );
        },
      },
    );
  };

  const onSubmit = () => {
    if (!message.trim() && quickTags.length === 0) return;
    const now = new Date();
    // 日志日期固定为「今天 + 当前时刻」，与日历选中的日期无关
    const pending: PendingLog = {
      id: newTempId(),
      content: message.trim(),
      date: now,
      tags: serializeTagGroups(quickTags),
      isTodo,
      status: "sending",
    };
    // 立即写入日志区域
    setPendingLogs((prev) => [...prev, pending]);
    // 立即清空输入
    setMessage("");
    setIsTodo(false);
    setQuickTags([]);
    // 发送后自动跳回今天（日历与日期列表同步切回今天所在月份）
    setSelectedDate(now);
    quickInputRef.current?.clearSelection();
    setScrollToken((value) => value + 1);
    // 异步发送
    sendLog(pending);
  };

  // 移动端底部输入框自适应高度
  const handleMobileMessageChange = (value: string) => {
    setMessage(value);
    const el = mobileInputRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
    }
  };

  const onResend = (id: string) => {
    const target = pendingLogs.find((item) => item.id === id);
    if (!target) return;
    setPendingLogs((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, status: "sending" as const } : item,
      ),
    );
    sendLog({ ...target, status: "sending" });
  };

  const filteredLogs = useMemo(() => {
    const pendings: LogItem[] = pendingLogs
      .filter((item) => sameDay(item.date, selectedDate))
      .map((item) => ({
        id: item.id,
        content: item.content,
        date: item.date,
        tags: item.tags,
        isTodo: item.isTodo,
        isTodoDone: false,
        syncStatus: item.status,
      }));
    const logs = [...(logsQuery.data ?? []), ...pendings];
    if (filter === "todo") {
      return logs.filter((log) => log.isTodo);
    }
    if (filter === "todo_open") {
      return logs.filter((log) => log.isTodo && !log.isTodoDone);
    }
    return logs;
  }, [filter, logsQuery.data, pendingLogs, selectedDate]);

  const memosApiUrl = process.env.NEXT_PUBLIC_MEMOS_API_URL ?? "";

  const onCopyLogs = async () => {
    const logs = logsQuery.data ?? [];
    if (logs.length === 0) {
      setMemosStatus("没有日志可复制");
      return;
    }

    const sorted = [...logs].sort((a, b) => a.date.getTime() - b.date.getTime());

    const formatDateTime = (date: Date) => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");
      const hours = String(date.getHours()).padStart(2, "0");
      const minutes = String(date.getMinutes()).padStart(2, "0");
      const seconds = String(date.getSeconds()).padStart(2, "0");
      return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
    };

    const lines: string[] = [];

    sorted.forEach((log) => {
      const timestamp = formatDateTime(log.date);
      const content = log.content?.trim() || "仅标签记录";

      if (log.isTodo) {
        const checkbox = log.isTodoDone ? "[x]" : "[ ]";
        lines.push(`${timestamp}: - ${checkbox} ${content}`);
      } else {
        lines.push(`${timestamp}: ${content}`);
      }

      if (log.replies && log.replies.length > 0) {
        log.replies.forEach((reply) => {
          const replyTimestamp = formatDateTime(reply.date);
          lines.push(`${replyTimestamp}:   ${reply.content}`);
        });
      }
    });

    const text = lines.join("\n");

    try {
      await navigator.clipboard.writeText(text);
      setMemosStatus("已复制到剪贴板");
    } catch {
      setMemosStatus("复制失败");
    }
  };

  const onSaveToMemos = async () => {
    if (!memosApiUrl) {
      setMemosStatus("未配置 Memos API 地址。");
      return;
    }
    const token = memosQuery.data?.memosToken;
    if (!token) {
      setMemosStatus("请在用户菜单中设置 Memos Token。");
      return;
    }
    const logs = logsQuery.data ?? [];
    if (logs.length === 0) {
      setMemosStatus("所选日期没有日志。");
      return;
    }

    const content = logs
      .map((log) => {
        const groups = parseTagGroups(log.tags);
        const tagLine = groups.length ? ` (${formatTagGroups(groups)})` : "";
        const line = log.content?.trim() ? log.content.trim() : "仅标签记录";
        return `- ${line}${tagLine}`;
      })
      .join("\n");

    try {
      const response = await fetch(memosApiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          state: "NORMAL",
          content,
          visibility: "PUBLIC",
          pinned: false,
        }),
      });

      if (!response.ok) {
        setMemosStatus("保存到 Memos 失败。");
        return;
      }

      setMemosStatus("已保存到 Memos。");
    } catch {
      setMemosStatus("保存到 Memos 失败。");
    }
  };

  const filterButtons: { key: typeof filter; label: string }[] = [
    { key: "all", label: "全部" },
    { key: "todo", label: "Todo" },
    { key: "todo_open", label: "未完成" },
  ];

  return (
    <div className="space-y-6">
      {/* ============ 桌面端：保持原有布局 ============ */}
      <section className="hidden gap-6 lg:grid lg:grid-cols-[minmax(0,800px)_360px] xl:grid-cols-[minmax(0,900px)_360px]">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700/60 dark:bg-slate-800/70">
          <div className="flex items-center justify-between">
            <section aria-labelledby="selected-day-label">
              <p
                id="selected-day-label"
                className="text-xs uppercase tracking-[0.3em] text-indigo-600 dark:text-indigo-400"
              >
                所选日期
              </p>
              <h2 className="mt-2 text-xl font-semibold text-slate-900 dark:text-slate-100">
                {dateLabel}
              </h2>
            </section>
            <div className="flex flex-col items-end gap-2 text-xs text-slate-500 dark:text-slate-400">
              <span>{logsQuery.data?.length ?? 0} 条记录</span>
              <button
                type="button"
                onClick={onSaveToMemos}
                title="把当日日志按 Markdown 格式推送到 Memos"
                className="whitespace-nowrap rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-600 hover:border-indigo-200 hover:text-indigo-600 dark:border-slate-700 dark:text-slate-300 dark:hover:border-indigo-400 dark:hover:text-indigo-300"
              >
                保存到 Memos
              </button>
            </div>
          </div>
          <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-2 dark:border-slate-700 dark:bg-slate-800/60">
            <div className="flex flex-col gap-y-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-4">
              <div
                role="group"
                aria-label="筛选日志"
                className="flex flex-wrap items-center gap-2"
              >
                <button
                  type="button"
                  onClick={() => setFilter("all")}
                  aria-pressed={filter === "all"}
                  className={`rounded-full px-3 py-1 ${
                    filter === "all"
                      ? "bg-white text-slate-900 shadow-sm dark:bg-slate-600 dark:text-white"
                      : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                  }`}
                >
                  全部
                </button>
                <button
                  type="button"
                  onClick={() => setFilter("todo")}
                  aria-pressed={filter === "todo"}
                  title="所有待办（含已完成）"
                  className={`rounded-full px-3 py-1 ${
                    filter === "todo"
                      ? "bg-white text-slate-900 shadow-sm dark:bg-slate-600 dark:text-white"
                      : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                  }`}
                >
                  Todo
                </button>
                <button
                  type="button"
                  onClick={() => setFilter("todo_open")}
                  aria-pressed={filter === "todo_open"}
                  title="仅未完成的待办"
                  className={`rounded-full px-3 py-1 ${
                    filter === "todo_open"
                      ? "bg-white text-slate-900 shadow-sm dark:bg-slate-600 dark:text-white"
                      : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                  }`}
                >
                  未完成
                </button>
              </div>
              <div
                aria-hidden="true"
                className="hidden h-5 w-px bg-slate-200 sm:block dark:bg-slate-600"
              />
              <div
                role="group"
                aria-label="工具"
                className="flex flex-wrap items-center gap-2"
              >
                <button
                  type="button"
                  onClick={() => setPrivacyMode((prev) => !prev)}
                  title={privacyMode ? "关闭隐私模式" : "开启隐私模式（模糊日志内容）"}
                  aria-pressed={privacyMode}
                  className={`flex items-center gap-1.5 rounded-full border px-3 py-1 shadow-sm transition ${
                    privacyMode
                      ? "border-indigo-600 bg-indigo-600 text-white"
                      : "border-slate-200 bg-white text-slate-500 hover:text-indigo-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:text-indigo-300"
                  }`}
                >
                  {privacyMode ? (
                    <svg
                      className="h-3.5 w-3.5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"
                      />
                    </svg>
                  ) : (
                    <svg
                      className="h-3.5 w-3.5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                      />
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                      />
                    </svg>
                  )}
                  隐私
                </button>
                <button
                  type="button"
                  onClick={onCopyLogs}
                  title="复制当日全部日志到剪贴板"
                  className="rounded-full border border-slate-200 bg-white px-3 py-1 text-slate-500 shadow-sm hover:text-indigo-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:text-indigo-300"
                >
                  复制
                </button>
                <button
                  type="button"
                  onClick={() => timelineRef.current?.scrollToTop()}
                  title="滚动到时间轴顶部"
                  className="rounded-full border border-slate-200 bg-white px-3 py-1 text-slate-500 shadow-sm hover:text-indigo-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:text-indigo-300"
                >
                  顶部
                </button>
                <button
                  type="button"
                  onClick={() => timelineRef.current?.scrollToBottom()}
                  title="滚动到时间轴底部"
                  className="rounded-full border border-slate-200 bg-white px-3 py-1 text-slate-500 shadow-sm hover:text-indigo-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:text-indigo-300"
                >
                  底部
                </button>
              </div>
            </div>
          </div>
          {memosStatus ? (
            <p className="mt-3 text-xs text-slate-500 dark:text-slate-400" role="status">
              {memosStatus}
            </p>
          ) : null}
          <div className="mt-6">
            <Timeline
              ref={timelineRef}
              logs={filteredLogs}
              privacyMode={privacyMode}
              scrollable={!isMobile}
              onToggleTodo={(id) => toggleTodo.mutate({ id })}
              onDelete={(id) => deleteLog.mutate({ id })}
              onUpdate={(id, content) => updateLog.mutate({ id, content })}
              onUpdateTags={(id, tags) => updateLog.mutate({ id, tags })}
              onAddReply={(id, content) =>
                addLog.mutate(
                  {
                    content,
                    date: new Date(),
                    parentId: id,
                    tags: "",
                  },
                  {
                    onSuccess: async () => {
                      await logsQuery.refetch();
                    },
                  },
                )
              }
              onResend={onResend}
              scrollToBottomKey={scrollToken}
            />
          </div>
        </div>

        <div className="space-y-6">
          <Calendar
            selectedDate={selectedDate}
            onSelectDate={(date) => setSelectedDate(date)}
          />
          <QuickInput
            ref={quickInputRef}
            initialSelected={quickTags}
            onTagsChange={setQuickTags}
          />
        </div>
      </section>

      {/* ============ 移动端：记录优先的轻量布局 ============ */}
      <section aria-label="移动端日志" className="lg:hidden">
        {/* 粘性工具栏：日期切换 + 日历/搜索入口 + 筛选 */}
        <div className="sticky top-12 z-20 -mx-4 border-b border-slate-200/70 bg-white/95 px-4 py-2 backdrop-blur sm:-mx-6 sm:px-6 dark:border-slate-800 dark:bg-slate-900/95">
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-1">
              <button
                type="button"
                onClick={() => shiftDay(-1)}
                aria-label="前一天"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 hover:text-indigo-600 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-indigo-300"
              >
                <svg
                  className="h-5 w-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 19l-7-7 7-7"
                  />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => setCalendarOpen((prev) => !prev)}
                aria-expanded={calendarOpen}
                title={calendarOpen ? "收起日历" : "展开日历"}
                className="flex min-w-0 items-center gap-1 rounded-full border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-800 dark:border-slate-700 dark:text-slate-100"
              >
                <span className="truncate">{mobileDateLabel}</span>
                <svg
                  className={`h-4 w-4 shrink-0 text-slate-400 transition-transform dark:text-slate-500 ${
                    calendarOpen ? "rotate-180" : ""
                  }`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => shiftDay(1)}
                aria-label="后一天"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 hover:text-indigo-600 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-indigo-300"
              >
                <svg
                  className="h-5 w-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 5l7 7-7 7"
                  />
                </svg>
              </button>
              {!isToday ? (
                <button
                  type="button"
                  onClick={goToday}
                  className="ml-1 shrink-0 rounded-full border border-indigo-200 px-2.5 py-1 text-xs text-indigo-600 dark:border-indigo-400/60 dark:text-indigo-300"
                >
                  今天
                </button>
              ) : null}
            </div>
            <Link
              href="/search"
              className="flex shrink-0 items-center gap-1.5 rounded-full border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:border-indigo-300 hover:text-indigo-600 dark:border-slate-700 dark:text-slate-300 dark:hover:border-indigo-400 dark:hover:text-indigo-300"
            >
              <svg
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
              搜索
            </Link>
          </div>
          <div className="mt-2 flex items-center justify-between gap-2">
            <div
              role="group"
              aria-label="筛选日志"
              className="flex items-center gap-1"
            >
              {filterButtons.map((btn) => (
                <button
                  key={btn.key}
                  type="button"
                  onClick={() => setFilter(btn.key)}
                  aria-pressed={filter === btn.key}
                  className={`rounded-full px-3 py-1 text-xs ${
                    filter === btn.key
                      ? "bg-indigo-600 text-white shadow-sm"
                      : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                  }`}
                >
                  {btn.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setPrivacyMode((prev) => !prev)}
              aria-pressed={privacyMode}
              title={privacyMode ? "关闭隐私模式" : "开启隐私模式（模糊日志内容）"}
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition ${
                privacyMode
                  ? "border-indigo-600 bg-indigo-600 text-white"
                  : "border-slate-200 text-slate-500 dark:border-slate-700 dark:text-slate-400"
              }`}
            >
              {privacyMode ? (
                <svg
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"
                  />
                </svg>
              ) : (
                <svg
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                  />
                </svg>
              )}
            </button>
          </div>
        </div>

        {/* 日历：默认隐藏，点日期按钮展开/收起 */}
        {calendarOpen ? (
          <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700/60 dark:bg-slate-800/70">
            <Calendar
              selectedDate={selectedDate}
              onSelectDate={(date) => {
                setSelectedDate(date);
                setCalendarOpen(false);
              }}
            />
            <button
              type="button"
              onClick={() => setCalendarOpen(false)}
              className="mt-3 w-full rounded-full border border-slate-200 py-2 text-xs text-slate-500 hover:border-indigo-200 hover:text-indigo-600 dark:border-slate-700 dark:text-slate-400 dark:hover:border-indigo-400 dark:hover:text-indigo-300"
            >
              收起日历
            </button>
          </div>
        ) : null}

        {/* 时间轴：整页滚动，专注记录 */}
        <div className="mt-4">
          <Timeline
            ref={timelineRef}
            logs={filteredLogs}
            privacyMode={privacyMode}
            scrollable={!isMobile}
            onToggleTodo={(id) => toggleTodo.mutate({ id })}
            onDelete={(id) => deleteLog.mutate({ id })}
            onUpdate={(id, content) => updateLog.mutate({ id, content })}
            onUpdateTags={(id, tags) => updateLog.mutate({ id, tags })}
            onAddReply={(id, content) =>
              addLog.mutate(
                {
                  content,
                  date: new Date(),
                  parentId: id,
                  tags: "",
                },
                {
                  onSuccess: async () => {
                    await logsQuery.refetch();
                  },
                },
              )
            }
            onResend={onResend}
            scrollToBottomKey={scrollToken}
          />
        </div>
      </section>

      {/* ============ 桌面端底部快捷记录 ============ */}
      <section
        aria-label="快捷记录"
        className="sticky bottom-0 z-30 hidden border-t border-slate-200 bg-white/95 px-4 py-3 shadow-lg backdrop-blur lg:block dark:border-slate-800 dark:bg-slate-900/95"
      >
        <div className="mx-auto w-full max-w-6xl space-y-2">
          {quickTags.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {quickTags.map((group) =>
                group.labels.map((label) => (
                  <span
                    key={`${group.category}-${label}`}
                    className="rounded-full border border-indigo-600 bg-indigo-50 px-3 py-1 text-xs text-indigo-600 dark:border-indigo-400 dark:bg-indigo-500/15 dark:text-indigo-300"
                  >
                    {group.category}: {label}
                  </span>
                ))
              )}
            </div>
          )}
          <div className="flex flex-col gap-2 md:flex-row">
            <button
              type="button"
              onClick={() => setIsTodo((prev) => !prev)}
              aria-pressed={isTodo}
              title="标记为待办"
              className={`rounded-full border px-3 py-2 text-xs transition ${
                isTodo
                  ? "border-indigo-600 bg-indigo-600 text-white shadow-sm"
                  : "border-slate-200 text-slate-500 hover:border-indigo-200 hover:text-indigo-600 dark:border-slate-700 dark:text-slate-400 dark:hover:border-indigo-400 dark:hover:text-indigo-300"
              }`}
            >
              Todo
            </button>
            <textarea
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  onSubmit();
                }
              }}
              placeholder="写点什么…"
              aria-label="日志内容"
              className="min-h-[52px] w-full flex-1 resize-none rounded-xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:ring-indigo-500"
            />
            <button
              type="button"
              onClick={onSubmit}
              disabled={!message.trim() && quickTags.length === 0}
              className="rounded-xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              发送
            </button>
          </div>
        </div>
      </section>

      {/* ============ 移动端底部快捷记录：紧凑单行 ============ */}
      <div className="sticky bottom-0 z-30 border-t border-slate-200 bg-white/95 px-4 pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-2 shadow-lg backdrop-blur lg:hidden dark:border-slate-800 dark:bg-slate-900/95">
        <div className="mx-auto w-full max-w-6xl space-y-2">
          {quickTags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {quickTags.map((group) =>
                group.labels.map((label) => (
                  <span
                    key={`${group.category}-${label}`}
                    className="rounded-full border border-indigo-600 bg-indigo-50 px-2.5 py-0.5 text-[11px] text-indigo-600 dark:border-indigo-400 dark:bg-indigo-500/15 dark:text-indigo-300"
                  >
                    {group.category}: {label}
                  </span>
                ))
              )}
            </div>
          )}
          <div className="flex items-end gap-2">
            <button
              type="button"
              onClick={() => setTagsOpen(true)}
              aria-label="选择快捷标签"
              aria-expanded={tagsOpen}
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border transition ${
                quickTags.length > 0
                  ? "border-indigo-600 bg-indigo-50 text-indigo-600 dark:border-indigo-400 dark:bg-indigo-500/15 dark:text-indigo-300"
                  : "border-slate-200 text-slate-500 dark:border-slate-700 dark:text-slate-400"
              }`}
            >
              <svg
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14"
                />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => setIsTodo((prev) => !prev)}
              aria-pressed={isTodo}
              className={`flex h-10 shrink-0 items-center rounded-xl border px-3 text-xs transition ${
                isTodo
                  ? "border-indigo-600 bg-indigo-600 text-white shadow-sm"
                  : "border-slate-200 text-slate-500 dark:border-slate-700 dark:text-slate-400"
              }`}
            >
              待办
            </button>
            <textarea
              ref={mobileInputRef}
              value={message}
              onChange={(event) => handleMobileMessageChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  onSubmit();
                }
              }}
              placeholder="写点什么…"
              aria-label="日志内容"
              rows={1}
              className="max-h-[140px] min-h-[40px] w-full flex-1 resize-none rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-base leading-snug text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:ring-indigo-500"
            />
            <button
              type="button"
              onClick={onSubmit}
              disabled={!message.trim() && quickTags.length === 0}
              aria-label="发送日志"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-sm transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <svg
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* ============ 移动端标签弹层（按钮触发） ============ */}
      {tagsOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setTagsOpen(false)}
            aria-hidden="true"
          />
          <div className="absolute inset-x-0 bottom-0 max-h-[75dvh] overflow-y-auto rounded-t-2xl border-t border-slate-200 bg-white p-4 shadow-xl dark:border-slate-700 dark:bg-slate-800">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                快捷标签
              </h3>
              <button
                type="button"
                onClick={() => setTagsOpen(false)}
                className="rounded-full bg-indigo-600 px-4 py-1.5 text-xs font-medium text-white transition hover:bg-indigo-500"
              >
                完成
              </button>
            </div>
            <QuickInput
              key={tagsOpen ? "open" : "closed"}
              initialSelected={quickTags}
              onTagsChange={setQuickTags}
            />
          </div>
        </div>
      ) : null}

      {showScrollTop ? (
        <button
          type="button"
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          aria-label="回到页面顶部"
          className="fixed bottom-24 right-6 hidden rounded-full border border-slate-200 bg-white/90 px-4 py-2 text-xs text-slate-600 shadow-lg backdrop-blur hover:text-indigo-600 lg:block dark:border-slate-700 dark:bg-slate-800/90 dark:text-slate-300 dark:hover:text-indigo-300"
        >
          回到顶部
        </button>
      ) : null}
    </div>
  );
}
