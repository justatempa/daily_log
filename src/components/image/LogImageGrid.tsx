"use client";

import { useState } from "react";
import { Dialog, DialogButton, DialogFooter } from "@/components/ui/dialog";
import { formatBytes, imageUrl, type LogImageInfo } from "@/utils/image";

/**
 * 日志里的图片墙 + 大图查看。
 * - 列表只加载缩略图（480px webp），省流量也省内存
 * - 点开默认看压缩图（长边 1600 webp），点「查看原图」才加载原始文件
 */
export function LogImageGrid({
  images,
  privacyMode = false,
}: {
  images?: LogImageInfo[];
  privacyMode?: boolean;
}) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [showOriginal, setShowOriginal] = useState(false);

  if (!images || images.length === 0) return null;

  const active = activeIndex === null ? null : images[activeIndex] ?? null;
  const single = images.length === 1;
  // 兜底比例：避免尺寸缺失时单图区域塌成 0 高度
  const firstImage = images[0];
  const singleRatio =
    firstImage.width > 0 && firstImage.height > 0
      ? `${firstImage.width} / ${firstImage.height}`
      : "4 / 3";
  const open = (index: number) => {
    setActiveIndex(index);
    setShowOriginal(false);
  };
  const step = (delta: number) => {
    if (activeIndex === null) return;
    setActiveIndex((activeIndex + delta + images.length) % images.length);
    setShowOriginal(false);
  };

  return (
    <>
      {single ? (
        <button
          type="button"
          onClick={() => open(0)}
          className={`mt-2 block max-w-[160px] overflow-hidden rounded-xl border border-slate-200 bg-slate-100 transition hover:border-indigo-300 dark:border-slate-700 dark:bg-slate-900 ${
            privacyMode ? "select-none blur-md" : ""
          }`}
          style={{ aspectRatio: singleRatio }}
          aria-label="查看图片"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl(images[0].id, "thumb")}
            alt={images[0].name ?? "日志图片"}
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover"
          />
        </button>
      ) : (
        <div
          className={`mt-2 grid max-w-[240px] grid-cols-3 gap-1.5 ${
            privacyMode ? "select-none blur-md" : ""
          }`}
        >
          {images.map((image, index) => (
            <button
              key={image.id}
              type="button"
              onClick={() => open(index)}
              aria-label={`查看第 ${index + 1} 张图片`}
              className="relative aspect-square overflow-hidden rounded-lg border border-slate-200 bg-slate-100 transition hover:border-indigo-300 dark:border-slate-700 dark:bg-slate-900"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imageUrl(image.id, "thumb")}
                alt={image.name ?? `日志图片 ${index + 1}`}
                loading="lazy"
                decoding="async"
                className="h-full w-full object-cover"
              />
            </button>
          ))}
        </div>
      )}

      <Dialog
        open={activeIndex !== null}
        onClose={() => setActiveIndex(null)}
        size="lg"
        className="max-w-[min(94vw,1080px)]"
        bodyClassName="flex min-h-[220px] items-center justify-center bg-slate-950 p-2"
        title={
          images.length > 1
            ? `图片 ${(activeIndex ?? 0) + 1} / ${images.length}`
            : active?.name ?? "查看图片"
        }
        footer={
          <DialogFooter className="items-center">
            <p className="mr-auto text-xs text-slate-500 dark:text-slate-400">
              {active ? `${active.width}×${active.height}` : ""}
              {active?.size
                ? ` · 原图 ${formatBytes(active.size)}`
                : ""}
              {active?.mediumSize
                ? ` · 压缩后 ${formatBytes(active.mediumSize)}`
                : ""}
              {active ? ` · 当前显示${showOriginal ? "原图" : "压缩图"}` : ""}
            </p>
            {images.length > 1 ? (
              <>
                <DialogButton onClick={() => step(-1)} aria-label="上一张">
                  上一张
                </DialogButton>
                <DialogButton onClick={() => step(1)} aria-label="下一张">
                  下一张
                </DialogButton>
              </>
            ) : null}
            <DialogButton
              variant="primary"
              onClick={() => setShowOriginal((value) => !value)}
            >
              {showOriginal ? "看压缩图" : "查看原图"}
            </DialogButton>
          </DialogFooter>
        }
      >
        {active ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              key={`${active.id}-${showOriginal ? "original" : "medium"}`}
              src={imageUrl(active.id, showOriginal ? "original" : "medium")}
              alt={active.name ?? "日志图片"}
              decoding="async"
              className="max-h-[64vh] max-w-full object-contain"
            />
          </>
        ) : null}
      </Dialog>
    </>
  );
}
