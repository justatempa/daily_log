"use client";
import React from "react";
import type { TimelineEntry } from "@/lib/entries.service";
import { EditIcon, DeleteIcon, TagIcon } from "./icons";

interface LogEntryProps {
  entry: TimelineEntry;
  isEditing: boolean;
  isSaving: boolean;
  editError: string;
  editingMessage: string;
  onEdit: (entry: TimelineEntry) => void;
  onDelete: (id: string) => void;
  onAddTag: (id: string) => void;
  onCancel: () => void;
  onSave: (id: string) => void;
  onMessageChange: (message: string) => void;
}

export default function LogEntry({
  entry,
  isEditing,
  isSaving,
  editError,
  editingMessage,
  onEdit,
  onDelete,
  onAddTag,
  onCancel,
  onSave,
  onMessageChange,
}: LogEntryProps) {
  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    return `${hours}:${minutes}`;
  };

  return (
    <div className="log-entry group">
      <div className="log-entry-timestamp">
        {formatTime(entry.timestamp)}
      </div>
      <div className="log-entry-content">
        {isEditing ? (
          <div className="space-y-2">
            <textarea
              className="min-h-[80px] w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              value={editingMessage}
              onChange={(e) => onMessageChange(e.target.value)}
              disabled={isSaving}
              autoFocus
            />
            {editError && <p className="text-xs text-red-500">{editError}</p>}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={onCancel}
                className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-60"
                disabled={isSaving}
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => onSave(entry.id)}
                className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:opacity-60"
                disabled={isSaving}
              >
                {isSaving ? "保存中…" : "保存"}
              </button>
            </div>
          </div>
        ) : (
          <>
            <p className="text-sm text-gray-800 whitespace-pre-wrap">
              {entry.message}
            </p>
            {(entry.tags?.length || 0) > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {entry.tags.map((tag) => (
                  <span key={tag.id} className="tag-chip">
                    #{tag.label}
                  </span>
                ))}
              </div>
            )}
          </>
        )}
      </div>
      <div className="log-entry-actions">
        {!isEditing && (
          <>
            <button
              onClick={() => onAddTag(entry.id)}
              className="action-button"
              title="添加标签"
            >
              <TagIcon />
            </button>
            <button
              onClick={() => onEdit(entry)}
              className="action-button"
              title="编辑记录"
            >
              <EditIcon />
            </button>
            <button
              onClick={() => onDelete(entry.id)}
              className="action-button"
              title="删除记录"
            >
              <DeleteIcon />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
