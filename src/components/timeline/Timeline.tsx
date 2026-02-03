"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { formatTagGroups, parseTagGroups } from "@/utils/tags";

type Reply = {
  id: string;
  content: string;
  date: Date;
};

type LogItem = {
  id: string;
  content: string;
  date: Date;
  tags: string;
  isTodo: boolean;
  isTodoDone: boolean;
  replies?: Reply[];
};

export type TimelineHandle = {
  scrollToTop: () => void;
  scrollToBottom: () => void;
};

function formatTime(date: Date) {
  return date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

const Timeline = forwardRef<TimelineHandle, {
  logs: LogItem[];
  onToggleTodo: (id: string) => void;
  onDelete: (id: string) => void;
  onUpdate: (id: string, content: string) => void;
  onAddReply: (id: string, content: string) => void;
  scrollToBottomKey: number;
}>(({
  logs,
  onToggleTodo,
  onDelete,
  onUpdate,
  onAddReply,
  scrollToBottomKey,
}, ref) => {
  const hasLogs = logs.length > 0;
  const sorted = useMemo(
    () => [...logs].sort((a, b) => a.date.getTime() - b.date.getTime()),
    [logs],
  );
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState("");
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [expandedReplies, setExpandedReplies] = useState<Set<string>>(
    () => new Set(),
  );
  const [activeReplyId, setActiveReplyId] = useState<string | null>(null);
  const replyInputRefs = useRef<Record<string, HTMLTextAreaElement | null>>({});
  const containerRef = useRef<HTMLDivElement | null>(null);

  useImperativeHandle(
    ref,
    () => ({
      scrollToTop: () => {
        const container = containerRef.current;
        if (container) {
          container.scrollTo({ top: 0, behavior: "smooth" });
        }
      },
      scrollToBottom: () => {
        const container = containerRef.current;
        if (container) {
          container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
        }
      },
    }),
    [],
  );

  useEffect(() => {
    if (!scrollToBottomKey) return;
    const container = containerRef.current;
    if (container) {
      container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
    }
  }, [scrollToBottomKey]);

  useEffect(() => {
    if (!activeReplyId) return;
    const input = replyInputRefs.current[activeReplyId];
    if (input) {
      input.focus();
      input.selectionStart = input.value.length;
      input.selectionEnd = input.value.length;
    }
  }, [activeReplyId]);

  return (
    <div
      ref={containerRef}
      className="max-h-[60vh] overflow-y-auto pr-2"
    >
      {hasLogs ? (
        <div className="space-y-4 pb-24">
          {sorted.map((log) => (
            <div
              key={log.id}
              className="relative rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
            >
          <div className="absolute right-4 top-4 flex items-center gap-3 text-xs text-slate-400">
            <button
              type="button"
              onClick={() =>
                setExpandedReplies((prev) => {
                  const next = new Set(prev);
                  if (next.has(log.id)) {
                    next.delete(log.id);
                    setActiveReplyId((current) =>
                      current === log.id ? null : current,
                    );
                  } else {
                    next.add(log.id);
                    setActiveReplyId(log.id);
                  }
                  return next;
                })
              }
              className="hover:text-indigo-500"
            >
              {log.replies?.length ? (
                expandedReplies.has(log.id) ? (
                  <>收起评论 {log.replies.length}</>
                ) : (
                  <>展开评论 {log.replies.length}</>
                )
              ) : (
                "评论"
              )}
            </button>
            <button
              type="button"
              onClick={() => {
                setEditingId(log.id);
                setEditingValue(log.content);
              }}
              className="hover:text-indigo-500"
            >
              编辑
            </button>
            <button
              type="button"
              onClick={() => onDelete(log.id)}
              className="text-rose-400 hover:text-rose-500"
            >
              删除
            </button>
          </div>
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3 pr-24">
              {log.isTodo ? (
                <input
                  type="checkbox"
                  checked={log.isTodoDone}
                  onChange={() => onToggleTodo(log.id)}
                  className="mt-1 h-4 w-4 rounded border border-slate-300 text-indigo-600"
                  aria-label="完成 Todo"
                />
              ) : (
                <div className="mt-1 h-4 w-4" />
              )}
              <div className="flex-1">
                {editingId === log.id ? (
                  <div className="space-y-2">
                    <input
                      value={editingValue}
                      onChange={(event) => setEditingValue(event.target.value)}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          if (!editingValue.trim()) return;
                          onUpdate(log.id, editingValue.trim());
                          setEditingId(null);
                        }}
                        className="rounded-full bg-indigo-500 px-3 py-1 text-[11px] text-white"
                      >
                        保存
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        className="rounded-full border border-slate-200 px-3 py-1 text-[11px] text-slate-500"
                      >
                        取消
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    {log.content ? (
                      <p
                        className={`text-sm font-medium text-slate-800 ${
                          log.isTodoDone ? "line-through opacity-60" : ""
                        }`}
                      >
                        {log.content}
                      </p>
                    ) : (
                      <p className="text-sm font-medium text-slate-500">
                        Tagged entry
                      </p>
                    )}
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-400">
                      <span>{formatTime(log.date)}</span>
                      {log.tags
                        ? (() => {
                            const formatted = formatTagGroups(
                              parseTagGroups(log.tags),
                            );
                            return formatted ? (
                              <span className="rounded-full bg-indigo-50 px-2 py-1 text-indigo-500">
                                {formatted}
                              </span>
                            ) : null;
                          })()
                        : null}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
          {log.replies && log.replies.length > 0 ? (
            <div className="mt-4 space-y-2 rounded-xl border border-slate-100 bg-slate-50 p-3 text-xs text-slate-500">
              <p className="text-[11px] uppercase tracking-[0.3em] text-slate-400">
                评论
              </p>
              {(expandedReplies.has(log.id)
                ? log.replies
                : [log.replies[log.replies.length - 1]]
              ).map((reply) =>
                reply ? (
                  <div
                    key={reply.id}
                    className="rounded-lg border border-slate-100 bg-white px-3 py-2"
                  >
                    <div className="text-[10px] uppercase text-slate-300">
                      {formatTime(reply.date)}
                    </div>
                    <div className="text-xs text-slate-600">
                      {reply.content}
                    </div>
                  </div>
                ) : null,
              )}
            </div>
          ) : null}

          {activeReplyId === log.id ? (
            <div className="mt-4">
              <div className="flex gap-2">
                <textarea
                  ref={(node) => {
                    replyInputRefs.current[log.id] = node;
                  }}
                  value={replyDrafts[log.id] ?? ""}
                  onChange={(event) =>
                    setReplyDrafts((prev) => ({
                      ...prev,
                      [log.id]: event.target.value,
                    }))
                  }
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      const value = replyDrafts[log.id]?.trim();
                      if (!value) return;
                      onAddReply(log.id, value);
                      setReplyDrafts((prev) => ({ ...prev, [log.id]: "" }));
                    }
                  }}
                  placeholder="写评论..."
                  className="min-h-[70px] w-full resize-none rounded-lg border border-slate-200 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-200"
                />
                <button
                  type="button"
                  onClick={() => {
                    const value = replyDrafts[log.id]?.trim();
                    if (!value) return;
                    onAddReply(log.id, value);
                    setReplyDrafts((prev) => ({ ...prev, [log.id]: "" }));
                  }}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-600 hover:border-indigo-200 hover:text-indigo-600"
                >
                  发送
                </button>
              </div>
            </div>
          ) : null}
            </div>
          ))}
        </div>
      ) : (
        <div className="flex h-full flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white p-10 text-center text-slate-400">
          <p className="text-sm uppercase tracking-[0.3em]">No logs</p>
          <p className="mt-2 text-xs">Start by adding a new entry.</p>
        </div>
      )}
    </div>
  );
});

Timeline.displayName = "Timeline";

export default Timeline;
