"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Calendar from "@/components/calendar/Calendar";
import Timeline, { type TimelineHandle } from "@/components/timeline/Timeline";
import QuickInput from "@/components/quick-input/QuickInput";
import { api } from "@/utils/api";
import {
  formatTagGroups,
  parseTagGroups,
  serializeTagGroups,
  type TagGroup,
} from "@/utils/tags";

export default function DashboardPage() {
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [message, setMessage] = useState("");
  const [memosStatus, setMemosStatus] = useState<string | null>(null);
  const [isTodo, setIsTodo] = useState(false);
  const [filter, setFilter] = useState<"all" | "todo" | "todo_open">("all");
  const [scrollToken, setScrollToken] = useState(0);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const timelineRef = useRef<TimelineHandle | null>(null);

  const logsQuery = api.log.getByDate.useQuery({ date: selectedDate });
  const memosQuery = api.setting.getMemosToken.useQuery();
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
      selectedDate.toLocaleDateString("en-US", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      }),
    [selectedDate],
  );

  const onSubmit = () => {
    if (!message.trim()) return;
    const now = new Date();
    const entryDate = new Date(selectedDate);
    entryDate.setHours(
      now.getHours(),
      now.getMinutes(),
      now.getSeconds(),
      now.getMilliseconds(),
    );
    addLog.mutate(
      {
        content: message.trim(),
        date: entryDate,
        tags: "",
        isTodo,
      },
      {
        onSuccess: async () => {
          setMessage("");
          setIsTodo(false);
          await logsQuery.refetch();
          setScrollToken((value) => value + 1);
        },
      },
    );
  };

  const onQuickSend = (tags: TagGroup[]) => {
    const now = new Date();
    const entryDate = new Date(selectedDate);
    entryDate.setHours(
      now.getHours(),
      now.getMinutes(),
      now.getSeconds(),
      now.getMilliseconds(),
    );
    addLog.mutate(
      {
        content: "",
        tags: serializeTagGroups(tags),
        date: entryDate,
      },
      {
        onSuccess: async () => {
          await logsQuery.refetch();
          setScrollToken((value) => value + 1);
        },
      },
    );
  };

  const filteredLogs = useMemo(() => {
    const logs = logsQuery.data ?? [];
    if (filter === "todo") {
      return logs.filter((log) => log.isTodo);
    }
    if (filter === "todo_open") {
      return logs.filter((log) => log.isTodo && !log.isTodoDone);
    }
    return logs;
  }, [filter, logsQuery.data]);

  const memosApiUrl = process.env.NEXT_PUBLIC_MEMOS_API_URL ?? "";

  const onSaveToMemos = async () => {
    if (!memosApiUrl) {
      setMemosStatus("Missing MEMOS API URL.");
      return;
    }
    const token = memosQuery.data?.memosToken;
    if (!token) {
      setMemosStatus("Set a memos token in the user menu.");
      return;
    }
    const logs = logsQuery.data ?? [];
    if (logs.length === 0) {
      setMemosStatus("No logs for the selected date.");
      return;
    }

    const content = logs
      .map((log) => {
        const groups = parseTagGroups(log.tags);
        const tagLine = groups.length ? ` (${formatTagGroups(groups)})` : "";
        const line = log.content?.trim() ? log.content.trim() : "Tagged entry";
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
        setMemosStatus("Failed to save to memos.");
        return;
      }

      setMemosStatus("Saved to memos.");
    } catch {
      setMemosStatus("Failed to save to memos.");
    }
  };

  return (
    <div className="space-y-6">
      <section className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-indigo-500">
                Selected day
              </p>
              <h2 className="mt-2 text-xl font-semibold text-slate-900">
                {dateLabel}
              </h2>
            </div>
            <div className="flex flex-col items-end gap-2 text-xs text-slate-400">
              <span>{logsQuery.data?.length ?? 0} entries</span>
              <button
                type="button"
                onClick={onSaveToMemos}
                className="rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-600 hover:border-indigo-200 hover:text-indigo-600"
              >
                Save to memos
              </button>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-2 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setFilter("all")}
                className={`rounded-full px-3 py-1 ${
                  filter === "all"
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                全部
              </button>
              <button
                type="button"
                onClick={() => setFilter("todo")}
                className={`rounded-full px-3 py-1 ${
                  filter === "todo"
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                Todo
              </button>
              <button
                type="button"
                onClick={() => setFilter("todo_open")}
                className={`rounded-full px-3 py-1 ${
                  filter === "todo_open"
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                未完成
              </button>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => timelineRef.current?.scrollToTop()}
                className="rounded-full border border-slate-200 bg-white px-3 py-1 text-slate-500 shadow-sm hover:text-indigo-600"
              >
                顶部
              </button>
              <button
                type="button"
                onClick={() => timelineRef.current?.scrollToBottom()}
                className="rounded-full border border-slate-200 bg-white px-3 py-1 text-slate-500 shadow-sm hover:text-indigo-600"
              >
                底部
              </button>
            </div>
          </div>
          {memosStatus ? (
            <p className="mt-3 text-xs text-slate-400">{memosStatus}</p>
          ) : null}
          <div className="mt-6">
            <Timeline
              ref={timelineRef}
              logs={filteredLogs}
              onToggleTodo={(id) => toggleTodo.mutate({ id })}
              onDelete={(id) => deleteLog.mutate({ id })}
              onUpdate={(id, content) => updateLog.mutate({ id, content })}
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
              scrollToBottomKey={scrollToken}
            />
          </div>
        </div>

        <div className="space-y-6">
          <Calendar
            selectedDate={selectedDate}
            onSelectDate={(date) => setSelectedDate(date)}
          />
          <QuickInput onSend={onQuickSend} />
        </div>
      </section>

      <section className="sticky bottom-0 z-30 border-t border-slate-200 bg-white/95 px-4 py-3 shadow-lg backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 md:flex-row">
          <button
            type="button"
            onClick={() => setIsTodo((prev) => !prev)}
            className={`rounded-full border px-3 py-2 text-xs transition ${
              isTodo
                ? "border-indigo-500 bg-indigo-500 text-white shadow-sm"
                : "border-slate-200 text-slate-500 hover:border-indigo-200 hover:text-indigo-600"
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
            placeholder="Add a note..."
            className="min-h-[52px] w-full flex-1 resize-none rounded-xl border border-slate-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
          />
          <button
            type="button"
            onClick={onSubmit}
            disabled={!message.trim() || addLog.isLoading}
            className="rounded-xl bg-indigo-500 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Send
          </button>
        </div>
      </section>
      {showScrollTop ? (
        <button
          type="button"
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          className="fixed bottom-24 right-6 rounded-full border border-slate-200 bg-white/90 px-4 py-2 text-xs text-slate-600 shadow-lg backdrop-blur hover:text-indigo-600"
        >
          回到顶部
        </button>
      ) : null}
    </div>
  );
}
