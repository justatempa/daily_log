"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { formatTagGroups, parseTagGroups, serializeTagGroups, type TagGroup } from "@/utils/tags";
import { parseRichText } from "@/utils/hashtag";
import { api } from "@/utils/api";

type Reply = {
  id: string;
  content: string;
  date: Date;
};

export type LogItem = {
  id: string;
  content: string;
  date: Date;
  tags: string;
  isTodo: boolean;
  isTodoDone: boolean;
  replies?: Reply[];
  /** 本地乐观条目的同步状态：sending=发送中，failed=发送失败 */
  syncStatus?: "sending" | "failed";
};

export type TimelineHandle = {
  scrollToTop: () => void;
  scrollToBottom: () => void;
};

function formatTime(date: Date) {
  return date.toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function formatDateTime(date: Date) {
  return date.toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }) + " " + formatTime(date);
}

const Timeline = forwardRef<TimelineHandle, {
  logs: LogItem[];
  privacyMode?: boolean;
  /** true 时按时间倒序（最新在前），用于搜索结果；默认 false 升序 */
  reverseSort?: boolean;
  /** true 时在每条日志上显示完整日期（跨天搜索用）；默认 false 只显示时分 */
  showDate?: boolean;
  onToggleTodo: (id: string) => void;
  onDelete: (id: string) => void;
  onUpdate: (id: string, content: string) => void;
  onUpdateTags: (id: string, tags: string) => void;
  onAddReply: (id: string, content: string) => void;
  onResend: (id: string) => void;
  scrollToBottomKey: number;
}>(({
  logs,
  privacyMode = false,
  reverseSort = false,
  showDate = false,
  onToggleTodo,
  onDelete,
  onUpdate,
  onUpdateTags,
  onAddReply,
  onResend,
  scrollToBottomKey,
}, ref) => {
  const hasLogs = logs.length > 0;
  const sorted = useMemo(
    () =>
      [...logs].sort((a, b) =>
        reverseSort
          ? b.date.getTime() - a.date.getTime()
          : a.date.getTime() - b.date.getTime(),
      ),
    [logs, reverseSort],
  );
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState("");
  const [editingTagsId, setEditingTagsId] = useState<string | null>(null);
  const [selectedTagsForEdit, setSelectedTagsForEdit] = useState<Array<{ category: string; label: string }>>([]);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [expandedReplies, setExpandedReplies] = useState<Set<string>>(
    () => new Set(),
  );
  const [activeReplyId, setActiveReplyId] = useState<string | null>(null);
  const replyInputRefs = useRef<Record<string, HTMLTextAreaElement | null>>({});
  const containerRef = useRef<HTMLDivElement | null>(null);

  const { data: availableTags } = api.quickTag.getGrouped.useQuery();

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
              className={`relative rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700/60 dark:bg-slate-800/70 ${
                openMenuId === log.id ? "z-20" : ""
              }`}
            >
          {!log.syncStatus && (
          <div className="absolute right-4 top-4">
            <button
              type="button"
              onClick={() => setOpenMenuId(openMenuId === log.id ? null : log.id)}
              aria-label="日志操作菜单"
              aria-expanded={openMenuId === log.id}
              className="text-slate-500 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-300"
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
                  d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z"
                />
              </svg>
            </button>
            {openMenuId === log.id && (
              <div className="absolute right-0 top-8 z-10 w-32 rounded-lg border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    setEditingTagsId(log.id);
                    const parsed = parseTagGroups(log.tags);
                    const selected: Array<{ category: string; label: string }> = [];
                    parsed.forEach((group) => {
                      group.labels.forEach((label) => {
                        selected.push({ category: group.category, label });
                      });
                    });
                    setSelectedTagsForEdit(selected);
                    setOpenMenuId(null);
                  }}
                  className="w-full px-4 py-2 text-left text-xs text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-700/60"
                >
                  标签
                </button>
                <button
                  type="button"
                  onClick={() => {
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
                    });
                    setOpenMenuId(null);
                  }}
                  className="w-full px-4 py-2 text-left text-xs text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-700/60"
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
                    setOpenMenuId(null);
                  }}
                  className="w-full px-4 py-2 text-left text-xs text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-700/60"
                >
                  编辑
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onDelete(log.id);
                    setOpenMenuId(null);
                  }}
                  className="w-full px-4 py-2 text-left text-xs text-rose-500 hover:bg-slate-50 dark:text-rose-400 dark:hover:bg-slate-700/60"
                >
                  删除
                </button>
              </div>
            )}
          </div>
          )}
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 flex-1 items-start gap-3 pr-12">
              {log.isTodo ? (
                <input
                  type="checkbox"
                  checked={log.isTodoDone}
                  onChange={() => onToggleTodo(log.id)}
                  disabled={log.syncStatus !== undefined}
                  className="mt-1 h-4 w-4 rounded border border-slate-300 text-indigo-600 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600 dark:bg-slate-900"
                  aria-label="完成 Todo"
                />
              ) : (
                <div className="mt-1 h-4 w-4" />
              )}
              <div className="min-w-0 flex-1">
                {editingId === log.id ? (
                  <div className="space-y-2">
                    <label htmlFor={`edit-${log.id}`} className="sr-only">
                      编辑日志内容
                    </label>
                    <input
                      id={`edit-${log.id}`}
                      value={editingValue}
                      onChange={(event) => setEditingValue(event.target.value)}
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:ring-indigo-500"
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          if (!editingValue.trim()) return;
                          onUpdate(log.id, editingValue.trim());
                          setEditingId(null);
                        }}
                        className="rounded-full bg-indigo-600 px-3 py-1 text-xs text-white hover:bg-indigo-500"
                      >
                        保存
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        className="rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-500 hover:text-slate-700 dark:border-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                      >
                        取消
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    {log.content ? (
                      <p
                        className={`break-words whitespace-pre-wrap text-[15px] leading-relaxed font-medium text-slate-800 dark:text-slate-100 ${
                          log.isTodoDone ? "line-through opacity-60" : ""
                        } ${
                          privacyMode
                            ? "select-none blur-md"
                            : ""
                        }`}
                      >
                        {parseRichText(log.content).map((seg, i) =>
                          seg.isHashtag ? (
                            <span key={i} className="text-indigo-600 font-semibold dark:text-indigo-300">
                              {seg.text}
                            </span>
                          ) : (
                            <span key={i}>{seg.text}</span>
                          )
                        )}
                      </p>
                    ) : (
                      <p
                        className={`text-sm font-medium text-slate-500 dark:text-slate-400 ${
                          privacyMode ? "select-none blur-md" : ""
                        }`}
                      >
                        仅标签记录
                      </p>
                    )}
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                      <span className={showDate ? "font-medium text-slate-600 dark:text-slate-300" : ""}>
                        {showDate ? formatDateTime(log.date) : formatTime(log.date)}
                      </span>
                      {log.tags
                        ? (() => {
                            const formatted = formatTagGroups(
                              parseTagGroups(log.tags),
                            );
                            return formatted ? (
                              <span
                                className={`rounded-full bg-indigo-50 px-2 py-1 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300 ${
                                  privacyMode ? "select-none blur-md" : ""
                                }`}
                              >
                                {formatted}
                              </span>
                            ) : null;
                          })()
                        : null}
                    </div>
                    {log.syncStatus ? (
                      <div className="mt-2 flex items-center gap-2">
                        {log.syncStatus === "sending" ? (
                          <>
                            <span className="h-3 w-3 animate-spin rounded-full border-2 border-indigo-200 border-t-indigo-500" />
                            <span className="text-xs text-slate-500 dark:text-slate-400">
                              发送中...
                            </span>
                          </>
                        ) : (
                          <>
                            <span className="text-xs font-medium text-rose-500">
                              发送失败
                            </span>
                            <button
                              type="button"
                              onClick={() => onResend(log.id)}
                              className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-medium text-rose-500 transition hover:bg-rose-100 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-400 dark:hover:bg-rose-500/20"
                            >
                              重发
                            </button>
                          </>
                        )}
                      </div>
                    ) : null}
                  </>
                )}
              </div>
            </div>
          </div>
          {log.replies && log.replies.length > 0 ? (
            <div className="mt-4 space-y-2 rounded-xl border border-slate-100 bg-slate-50 p-3 text-xs text-slate-500 dark:border-slate-700/50 dark:bg-slate-800/40 dark:text-slate-400">
              <p className="text-xs tracking-[0.3em] text-slate-500 dark:text-slate-400">
                评论
              </p>
              {(expandedReplies.has(log.id)
                ? log.replies
                : [log.replies[log.replies.length - 1]]
              ).map((reply) =>
                reply ? (
                  <div
                    key={reply.id}
                    className="rounded-lg border border-slate-100 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-800/70"
                  >
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      {showDate ? formatDateTime(reply.date) : formatTime(reply.date)}
                    </div>
                    <div className="text-xs text-slate-600 dark:text-slate-300">
                      <span
                        className={
                          privacyMode ? "select-none blur-md" : undefined
                        }
                      >
                        {parseRichText(reply.content).map((seg, i) =>
                          seg.isHashtag ? (
                            <span key={i} className="text-indigo-600 font-medium dark:text-indigo-300">
                              {seg.text}
                            </span>
                          ) : (
                            <span key={i}>{seg.text}</span>
                          )
                        )}
                      </span>
                    </div>
                  </div>
                ) : null,
              )}
            </div>
          ) : null}

          {activeReplyId === log.id ? (
            <div className="mt-4">
              <div className="flex gap-2">
                <label htmlFor={`reply-${log.id}`} className="sr-only">
                  写评论
                </label>
                <textarea
                  id={`reply-${log.id}`}
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
                  className="min-h-[70px] w-full resize-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:ring-indigo-500"
                />
                <button
                  type="button"
                  onClick={() => {
                    const value = replyDrafts[log.id]?.trim();
                    if (!value) return;
                    onAddReply(log.id, value);
                    setReplyDrafts((prev) => ({ ...prev, [log.id]: "" }));
                  }}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-600 hover:border-indigo-200 hover:text-indigo-600 dark:border-slate-700 dark:text-slate-300 dark:hover:border-indigo-400 dark:hover:text-indigo-300"
                >
                  发送
                </button>
              </div>
            </div>
          ) : null}

          {editingTagsId === log.id ? (
            <div
              role="dialog"
              aria-modal="true"
              aria-label="编辑标签"
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
            >
              <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-700 dark:bg-slate-800">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">编辑标签</h3>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  点击标签进行选择或取消选择
                </p>
                <div className="mt-4 max-h-[400px] space-y-3 overflow-y-auto">
                  {availableTags && Object.entries(availableTags).length > 0 ? (
                    Object.entries(availableTags).map(([category, labels]) => (
                      <div key={category}>
                        <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                          {category}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {labels.map((label) => {
                            const isSelected = selectedTagsForEdit.some(
                              (item) =>
                                item.category === category && item.label === label,
                            );
                            return (
                              <button
                                key={`${category}-${label}`}
                                type="button"
                                onClick={() => {
                                  setSelectedTagsForEdit((prev) => {
                                    const exists = prev.find(
                                      (item) =>
                                        item.category === category &&
                                        item.label === label,
                                    );
                                    if (exists) {
                                      return prev.filter(
                                        (item) =>
                                          item.category !== category ||
                                          item.label !== label,
                                      );
                                    }
                                    return [...prev, { category, label }];
                                  });
                                }}
                                aria-pressed={isSelected}
                                className={`rounded-full border px-3 py-1 text-xs transition ${
                                  isSelected
                                    ? "border-indigo-600 bg-indigo-50 text-indigo-600 dark:border-indigo-400 dark:bg-indigo-500/15 dark:text-indigo-300"
                                    : "border-slate-200 text-slate-500 hover:border-indigo-200 dark:border-slate-700 dark:text-slate-400 dark:hover:border-indigo-400"
                                }`}
                              >
                                {label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      没有可用的标签，请先在快捷输入中添加
                    </p>
                  )}
                </div>
                <div className="mt-4 flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const map = new Map<string, string[]>();
                      for (const item of selectedTagsForEdit) {
                        if (!map.has(item.category)) {
                          map.set(item.category, []);
                        }
                        map.get(item.category)?.push(item.label);
                      }
                      const tagGroups: TagGroup[] = Array.from(map.entries()).map(
                        ([category, labels]) => ({
                          category,
                          labels,
                        }),
                      );
                      onUpdateTags(log.id, serializeTagGroups(tagGroups));
                      setEditingTagsId(null);
                    }}
                    className="rounded-full bg-indigo-600 px-4 py-2 text-xs text-white hover:bg-indigo-500"
                  >
                    保存
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingTagsId(null)}
                    className="rounded-full border border-slate-200 px-4 py-2 text-xs text-slate-600 hover:border-indigo-200 dark:border-slate-700 dark:text-slate-300 dark:hover:border-indigo-400"
                  >
                    取消
                  </button>
                </div>
              </div>
            </div>
          ) : null}
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center text-slate-500 dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-400">
          <p className="text-sm uppercase tracking-[0.3em]">暂无记录</p>
          <p className="mt-2 text-xs">点击底部输入区，记下第一条吧。</p>
        </div>
      )}
    </div>
  );
});

Timeline.displayName = "Timeline";

export default Timeline;