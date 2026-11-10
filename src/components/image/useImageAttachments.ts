"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  IMAGE_ACCEPT,
  IMAGE_MAX_BYTES,
  MAX_IMAGES_PER_LOG,
  formatBytes,
  imageUrl,
} from "@/utils/image";

/**
 * 输入区图片附件队列：选中文件立刻上传（服务端做压缩 + 缩略图），
 * 拿到图片 id 后等日志发送时再随 imageIds 一起提交。
 *
 * 状态说明：
 * - uploading：本地预览（objectURL），不可发送（避免发送时图片还没落地）
 * - ready：已落盘，预览切到服务端缩略图
 * - failed：上传失败，可点「重试」用同一个文件再传
 */

export type AttachmentStatus = "uploading" | "ready" | "failed";

export type ImageAttachment = {
  /** 本地临时标识，上传成功后仍保留，便于删除/重试 */
  key: string;
  /** 服务端图片 id（ready 后才有） */
  id?: string;
  status: AttachmentStatus;
  /** 预览地址：上传中用 blob:，ready 后用服务端缩略图 */
  previewUrl: string;
  width?: number;
  height?: number;
  name: string;
  size?: number;
  mediumSize?: number;
  error?: string;
};

type UploadResponse = {
  ok?: boolean;
  error?: string;
  images?: Array<{
    id: string;
    name: string;
    width: number;
    height: number;
    size: number;
    mediumSize: number;
    mime: string;
  }>;
};

function newKey() {
  return `img-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export type UseImageAttachmentsResult = {
  items: ImageAttachment[];
  /** 已就绪、可以随日志提交的图片 id */
  readyIds: string[];
  /** 是否有图片还在上传（发送按钮据此禁用） */
  uploading: boolean;
  /** 已达数量上限 */
  full: boolean;
  error: string | null;
  clearError: () => void;
  addFiles: (files: FileList | File[] | null | undefined) => void;
  remove: (key: string) => void;
  retry: (key: string) => void;
  clear: () => void;
};

export function useImageAttachments(
  limit: number = MAX_IMAGES_PER_LOG,
): UseImageAttachmentsResult {
  const [items, setItems] = useState<ImageAttachment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const filesRef = useRef(new Map<string, File>());
  const blobsRef = useRef(new Map<string, string>());
  const itemsRef = useRef<ImageAttachment[]>([]);

  itemsRef.current = items;

  const revokeBlob = useCallback((key: string) => {
    const url = blobsRef.current.get(key);
    if (url) {
      URL.revokeObjectURL(url);
      blobsRef.current.delete(key);
    }
  }, []);

  // 卸载时释放所有本地预览，避免内存泄漏
  useEffect(
    () => () => {
      for (const url of blobsRef.current.values()) {
        URL.revokeObjectURL(url);
      }
      blobsRef.current.clear();
    },
    [],
  );

  const upload = useCallback(
    async (key: string, file: File) => {
      const form = new FormData();
      form.append("file", file);

      try {
        const response = await fetch("/api/images/upload", {
          method: "POST",
          body: form,
        });
        const payload = (await response
          .json()
          .catch(() => null)) as UploadResponse | null;
        const image = payload?.images?.[0];
        if (!response.ok || !payload?.ok || !image) {
          throw new Error(payload?.error ?? "图片上传失败");
        }

        revokeBlob(key);
        filesRef.current.delete(key);
        setItems((prev) =>
          prev.map((item) =>
            item.key === key
              ? {
                  ...item,
                  id: image.id,
                  width: image.width,
                  height: image.height,
                  size: image.size,
                  mediumSize: image.mediumSize,
                  previewUrl: imageUrl(image.id, "thumb"),
                  status: "ready" as const,
                  error: undefined,
                }
              : item,
          ),
        );
      } catch (uploadError) {
        setItems((prev) =>
          prev.map((item) =>
            item.key === key
              ? {
                  ...item,
                  status: "failed" as const,
                  error:
                    uploadError instanceof Error
                      ? uploadError.message
                      : "图片上传失败",
                }
              : item,
          ),
        );
      }
    },
    [revokeBlob],
  );

  const addFiles = useCallback(
    (files: FileList | File[] | null | undefined) => {
      if (!files) return;
      const list = Array.from(files);
      if (list.length === 0) return;

      const current = itemsRef.current;
      const remaining = limit - current.length;
      if (remaining <= 0) {
        setError(`最多只能添加 ${limit} 张图片`);
        return;
      }
      if (list.length > remaining) {
        setError(`最多只能添加 ${limit} 张图片，已忽略多余的 ${list.length - remaining} 张`);
      } else {
        setError(null);
      }

      for (const file of list.slice(0, remaining)) {
        if (!IMAGE_ACCEPT.split(",").includes(file.type)) {
          setError(
            `「${file.name}」格式不支持，请用 JPG / PNG / WebP / GIF / AVIF`,
          );
          continue;
        }
        if (file.size > IMAGE_MAX_BYTES) {
          setError(
            `「${file.name}」超过 ${formatBytes(IMAGE_MAX_BYTES)}，请先压缩`,
          );
          continue;
        }

        const key = newKey();
        const previewUrl = URL.createObjectURL(file);
        filesRef.current.set(key, file);
        blobsRef.current.set(key, previewUrl);
        setItems((prev) => [
          ...prev,
          {
            key,
            status: "uploading" as const,
            previewUrl,
            name: file.name,
          },
        ]);
        void upload(key, file);
      }
    },
    [limit, upload],
  );

  const remove = useCallback(
    (key: string) => {
      revokeBlob(key);
      filesRef.current.delete(key);
      const target = itemsRef.current.find((item) => item.key === key);
      setItems((prev) => prev.filter((item) => item.key !== key));
      // 已落盘的图片顺手删掉，别在 uploads 里留垃圾
      if (target?.id && target.status === "ready") {
        void fetch(`/api/images/${encodeURIComponent(target.id)}`, {
          method: "DELETE",
        }).catch(() => undefined);
      }
    },
    [revokeBlob],
  );

  const retry = useCallback(
    (key: string) => {
      const file = filesRef.current.get(key);
      if (!file) {
        setError("找不到原始文件，请重新选择图片");
        return;
      }
      setItems((prev) =>
        prev.map((item) =>
          item.key === key
            ? { ...item, status: "uploading" as const, error: undefined }
            : item,
        ),
      );
      void upload(key, file);
    },
    [upload],
  );

  const clear = useCallback(() => {
    for (const key of Array.from(blobsRef.current.keys())) {
      revokeBlob(key);
    }
    filesRef.current.clear();
    setItems([]);
    setError(null);
  }, [revokeBlob]);

  const clearError = useCallback(() => setError(null), []);

  const readyIds = useMemo(
    () =>
      items
        .filter((item) => item.status === "ready" && item.id)
        .map((item) => item.id as string),
    [items],
  );

  return {
    items,
    readyIds,
    uploading: items.some((item) => item.status === "uploading"),
    full: items.length >= limit,
    error,
    clearError,
    addFiles,
    remove,
    retry,
    clear,
  };
}
