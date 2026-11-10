"use client";

import { useRef } from "react";
import { IMAGE_ACCEPT, MAX_IMAGES_PER_LOG } from "@/utils/image";
import type { UseImageAttachmentsResult } from "@/components/image/useImageAttachments";

/** 选图按钮（自带隐藏的 file input，支持多选） */
export function ImageAttachButton({
  attachments,
  compact = false,
  className = "",
}: {
  attachments: UseImageAttachmentsResult;
  compact?: boolean;
  className?: string;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const count = attachments.items.length;

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={IMAGE_ACCEPT}
        multiple
        className="hidden"
        onChange={(event) => {
          attachments.addFiles(event.target.files);
          // 清空 value，保证同一个文件再选一次也会触发 change
          event.target.value = "";
        }}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        aria-label="添加图片"
        title={
          attachments.full
            ? `最多添加 ${MAX_IMAGES_PER_LOG} 张图片`
            : "添加图片（也支持直接粘贴截图）"
        }
        className={`relative flex shrink-0 items-center justify-center border transition ${
          compact ? "h-10 w-10 rounded-xl" : "h-[52px] w-[52px] rounded-xl"
        } ${
          count > 0
            ? "border-indigo-600 bg-indigo-50 text-indigo-600 dark:border-indigo-400 dark:bg-indigo-500/15 dark:text-indigo-300"
            : "border-slate-200 text-slate-500 hover:border-indigo-200 hover:text-indigo-600 dark:border-slate-700 dark:text-slate-400 dark:hover:border-indigo-400 dark:hover:text-indigo-300"
        } ${className}`}
      >
        <svg
          className={compact ? "h-5 w-5" : "h-5 w-5"}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
          />
        </svg>
        {count > 0 ? (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-indigo-600 px-1 text-[10px] font-semibold text-white dark:bg-indigo-500">
            {count}
          </span>
        ) : null}
      </button>
    </>
  );
}

/** 已选图片预览条：上传中显示转圈，失败可点重试，右上角 × 移除 */
export function ImageAttachmentPreview({
  attachments,
  compact = false,
}: {
  attachments: UseImageAttachmentsResult;
  compact?: boolean;
}) {
  const { items } = attachments;
  if (items.length === 0) return null;
  const size = compact ? "h-12 w-12" : "h-14 w-14";

  return (
    <div className="flex flex-wrap items-center gap-2">
      {items.map((item) => (
        <div
          key={item.key}
          className={`relative overflow-hidden rounded-lg border border-slate-200 bg-slate-100 dark:border-slate-700 dark:bg-slate-900 ${size}`}
        >
          {/* 本地预览是 blob:，无需 next/image 优化 */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={item.previewUrl}
            alt={item.name}
            className={`h-full w-full object-cover ${
              item.status === "uploading" ? "opacity-60" : ""
            }`}
          />
          {item.status === "uploading" ? (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-900/20">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/70 border-t-transparent" />
            </div>
          ) : null}
          {item.status === "failed" ? (
            <button
              type="button"
              onClick={() => attachments.retry(item.key)}
              title={item.error ?? "上传失败，点击重试"}
              className="absolute inset-0 flex flex-col items-center justify-center gap-0.5 bg-rose-600/80 text-[10px] font-medium text-white"
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
                  d="M12 9v2m0 4h.01M5.07 19h13.86a2 2 0 001.74-3L13.73 4a2 2 0 00-3.46 0L3.32 16a2 2 0 001.75 3z"
                />
              </svg>
              重试
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => attachments.remove(item.key)}
            aria-label={`移除图片 ${item.name}`}
            className="absolute right-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-slate-900/60 text-white transition hover:bg-rose-600"
          >
            <svg
              className="h-3 w-3"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
      ))}
      {attachments.error ? (
        <p className="text-xs text-rose-500 dark:text-rose-400" role="alert">
          {attachments.error}
        </p>
      ) : null}
    </div>
  );
}
