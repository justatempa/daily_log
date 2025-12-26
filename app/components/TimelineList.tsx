"use client";

import { useMemo, useState, memo } from "react";
import type { TimelineEntry } from "@/lib/entries.service";
import type { TimelineTag } from "@/lib/tags.service";

interface TimelineListProps {
  entries: TimelineEntry[];
  onEdit?: (id: string, message: string) => Promise<void> | void;
  onDelete?: (id: string) => void;
  onAddTag?: (id: string) => void;
  onRetry?: (id: string) => void;
}

const WEEKDAY_LABELS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

const isSameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

const formatFullDateLabel = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const weekday = WEEKDAY_LABELS[date.getDay()];
  return `${year}.${month}.${day} ${weekday}`;
};

const formatMonthDay = (date: Date) =>
  `${date.getMonth() + 1}月${date.getDate()}日`;

const formatTime = (timestamp: string) => {
  const date = new Date(timestamp);
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
};

const formatDateTime = (timestamp: string) => {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
};

const TagChip = memo(function TagChip({ tag }: { tag: TimelineTag }) {
  const indicatorColor = tag.color || "#6366F1";
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full bg-primary-50 px-2 py-1 text-xs font-medium text-primary-700 border border-primary-200 transition-all hover:bg-primary-100"
      style={{
        borderColor: `${indicatorColor}30`,
        backgroundColor: `${indicatorColor}15`,
        color: indicatorColor,
      }}
    >
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ backgroundColor: indicatorColor }}
      ></span>
      {tag.label}
    </span>
  );
});

const TimelineList = memo(function TimelineList({
  entries,
  onEdit,
  onDelete,
  onAddTag,
  onRetry,
}: TimelineListProps) {
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [editingMessage, setEditingMessage] = useState("");
  const [savingEntryId, setSavingEntryId] = useState<string | null>(null);
  const [editError, setEditError] = useState("");

  const startEditing = (entry: TimelineEntry) => {
    if (!onEdit) return;
    if (entry.status && entry.status !== "saved") return;
    setEditingEntryId(entry.id);
    setEditingMessage(entry.message);
    setEditError("");
  };

  const cancelEditing = () => {
    if (savingEntryId) return;
    setEditingEntryId(null);
    setEditingMessage("");
    setEditError("");
  };

  const saveEditing = async (entryId: string) => {
    if (!onEdit) return;
    const trimmed = editingMessage.trim();
    if (!trimmed) {
      setEditError("内容不能为空");
      return;
    }

    setSavingEntryId(entryId);
    try {
      await onEdit(entryId, trimmed);
      setEditingEntryId(null);
      setEditingMessage("");
      setEditError("");
    } catch (error) {
      console.error("Failed to inline edit entry:", error);
      setEditError("保存失败，请稍后重试");
    } finally {
      setSavingEntryId(null);
    }
  };

  const dateLabel = useMemo(() => {
    const today = new Date();
    if (entries.length === 0) {
      return formatFullDateLabel(today);
    }
    const date = new Date(entries[0].timestamp);
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);

    if (isSameDay(date, today)) {
      return `今天 ${formatMonthDay(date)}`;
    }

    if (isSameDay(date, yesterday)) {
      return `昨天 ${formatMonthDay(date)}`;
    }

    return formatFullDateLabel(date);
  }, [entries]);

  if (entries.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="w-16 h-16 rounded-full bg-neutral-100 flex items-center justify-center mx-auto mb-3">
          <i className="fas fa-clock text-xl text-neutral-300"></i>
        </div>
        <p className="text-neutral-500 text-base">今天还没有记录</p>
        <p className="text-neutral-400 text-xs mt-1">开始记录你的精彩时刻吧</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2.5 mb-4">
        <div className="h-6 w-1 rounded-full gradient-primary"></div>
        <h2 className="text-lg font-bold text-dark">{dateLabel}</h2>
        <div className="flex-1 h-px bg-gradient-to-r from-neutral-200 to-transparent"></div>
      </div>

      {entries.map((entry, index) => {
        const visibleTags = (entry.tags ?? []).slice(0, 5);
        const hiddenTagCount = Math.max(
          (entry.tags?.length || 0) - visibleTags.length,
          0
        );
        const isEditing = editingEntryId === entry.id;
        const isSaving = savingEntryId === entry.id;
        const entryStatus = entry.status ?? "saved";
        const isPending = entryStatus === "pending";
        const isFailed = entryStatus === "failed";
        const canOperate = entryStatus === "saved";

        return (
          <div
            key={entry.id}
            className={`card-elevated p-4 hover:shadow-soft transition-all duration-200 animate-slide-up group overflow-hidden ${
              isPending ? "opacity-90" : ""
            } ${isFailed ? "border border-rose-100" : ""}`}
            style={{ animationDelay: `${index * 30}ms` }}
          >
            <div className="flex items-start gap-3 w-full">
              {/* Time Badge */}
              <div className="flex-shrink-0">
                <div
                  className="relative w-12 h-12 rounded-xl gradient-primary flex flex-col items-center justify-center text-white shadow-sm"
                  title={formatDateTime(entry.timestamp)}
                >
                  <div className="text-[0.6rem] font-medium opacity-90">
                    {formatTime(entry.timestamp).split(":")[0]}
                  </div>
                  <div className="text-lg font-bold leading-none">
                    {formatTime(entry.timestamp).split(":")[1]}
                  </div>
                </div>
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0 overflow-hidden">
                {isEditing ? (
                  <div className="space-y-2">
                    <textarea
                      className="w-full min-h-[100px] rounded-lg border border-primary-200 bg-white px-3 py-2 text-sm text-dark focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-100 transition-all break-words resize-none"
                      value={editingMessage}
                      onChange={(event) => {
                        setEditingMessage(event.target.value);
                        if (editError) {
                          setEditError("");
                        }
                      }}
                      disabled={isSaving}
                      autoFocus
                      placeholder="输入记录内容..."
                    />
                    {editError && (
                      <p className="text-xs text-rose-500 flex items-center gap-1">
                        <i className="fas fa-exclamation-circle"></i>
                        {editError}
                      </p>
                    )}
                    <div className="flex justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={cancelEditing}
                        className="px-3 py-1.5 rounded-lg border border-neutral-200 text-neutral-600 hover:bg-neutral-50 transition-colors disabled:opacity-60 text-sm"
                        disabled={isSaving}
                      >
                        取消
                      </button>
                      <button
                        type="button"
                        onClick={() => saveEditing(entry.id)}
                        className="px-4 py-1.5 rounded-lg gradient-primary text-white font-medium hover:opacity-90 transition-all disabled:opacity-60 shadow-sm text-sm"
                        disabled={isSaving}
                      >
                        {isSaving ? (
                          <>
                            <i className="fas fa-spinner fa-spin mr-1 text-xs"></i>
                            保存中...
                          </>
                        ) : (
                          "保存"
                        )}
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="rounded-lg bg-neutral-50 border border-neutral-200 px-2.5 py-2 text-sm leading-relaxed text-dark whitespace-pre-wrap break-words overflow-hidden word-break mb-2" style={{ wordBreak: 'break-word', overflowWrap: 'break-word' }}>
                      {entry.message}
                    </div>

                    {/* Tags */}
                    {visibleTags.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5 mb-2">
                        {visibleTags.map((tag) => (
                          <TagChip key={tag.id} tag={tag} />
                        ))}
                        {hiddenTagCount > 0 && (
                          <span className="rounded-full bg-neutral-100 px-2 py-1 text-xs font-medium text-neutral-500">
                            +{hiddenTagCount}
                          </span>
                        )}
                      </div>
                    )}

                    {isPending && (
                      <div className="flex items-center gap-1.5 text-xs text-primary-600 bg-primary-50 border border-primary-100 rounded-lg px-2.5 py-1.5">
                        <i className="fas fa-spinner fa-spin text-[0.6rem]"></i>
                        <span>正在同步...</span>
                      </div>
                    )}

                    {isFailed && (
                      <div className="mt-2 flex items-center justify-between gap-2 rounded-lg border border-rose-100 bg-rose-50 px-2.5 py-1.5 text-xs text-rose-600">
                        <div className="flex items-center gap-1.5">
                          <i className="fas fa-exclamation-triangle text-[0.6rem]"></i>
                          <span>{entry.errorMessage ?? "发送失败，请重试"}</span>
                        </div>
                        {onRetry && (
                          <button
                            type="button"
                            onClick={() => onRetry(entry.id)}
                            className="text-rose-600 font-medium hover:text-rose-500 text-xs"
                          >
                            重试
                          </button>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Actions */}
              {!isEditing && canOperate && (
                <div className="flex-shrink-0 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  {onAddTag && (
                    <button
                      onClick={() => onAddTag(entry.id)}
                      className="w-7 h-7 rounded-lg bg-amber-50 text-amber-600 hover:bg-amber-100 border border-amber-200 flex items-center justify-center transition-all hover:scale-105 active:scale-95"
                      title="添加标签"
                      type="button"
                    >
                      <i className="fas fa-tag text-xs"></i>
                    </button>
                  )}
                  {onEdit && (
                    <button
                      onClick={() => startEditing(entry)}
                      className="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 border border-blue-200 flex items-center justify-center transition-all hover:scale-105 active:scale-95"
                      title="编辑记录"
                      type="button"
                    >
                      <i className="fas fa-pen text-xs"></i>
                    </button>
                  )}
                  {onDelete && (
                    <button
                      onClick={() => onDelete(entry.id)}
                      className="w-7 h-7 rounded-lg bg-rose-50 text-rose-600 hover:bg-rose-100 border border-rose-200 flex items-center justify-center transition-all hover:scale-105 active:scale-95"
                      title="删除记录"
                      type="button"
                    >
                      <i className="fas fa-trash text-xs"></i>
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
});

export default TimelineList;
