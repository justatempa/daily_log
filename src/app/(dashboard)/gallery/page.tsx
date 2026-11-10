"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Dialog, DialogButton, DialogFooter } from "@/components/ui/dialog";
import { api } from "@/utils/api";
import { formatBytes, imageUrl, type GalleryImage } from "@/utils/image";

const PAGE_SIZE = 48;

/** Date -> yyyy-mm-dd（本地时区，和仪表盘的 ?date= 参数同格式） */
function toDayParam(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatDayLabel(date: Date): string {
  const weekday = date.toLocaleDateString("zh-CN", { weekday: "short" });
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日 · ${weekday}`;
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export default function GalleryPage() {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [showOriginal, setShowOriginal] = useState(false);
  const utils = api.useUtils();

  const firstPage = api.log.listImages.useQuery({ page: 1, pageSize: PAGE_SIZE });
  // 后续分页手动追加（数据量不大，按需加载即可，避免改动全局的无限查询配置）
  const [morePages, setMorePages] = useState<
    Array<{ items: GalleryImage[]; page: number; hasMore: boolean }>
  >([]);
  const [loadingMore, setLoadingMore] = useState(false);

  const images = useMemo<GalleryImage[]>(
    () => [
      ...(firstPage.data?.items ?? []),
      ...morePages.flatMap((page) => page.items),
    ],
    [firstPage.data, morePages],
  );
  const total = firstPage.data?.total ?? 0;
  const lastLoadedPage = morePages.length
    ? morePages[morePages.length - 1]
    : null;
  const hasMore = lastLoadedPage
    ? lastLoadedPage.hasMore
    : firstPage.data?.hasMore ?? false;

  const loadMore = async () => {
    if (loadingMore) return;
    setLoadingMore(true);
    try {
      const next = await utils.log.listImages.fetch({
        page: (lastLoadedPage?.page ?? 1) + 1,
        pageSize: PAGE_SIZE,
      });
      setMorePages((prev) => [
        ...prev,
        { items: next.items, page: next.page, hasMore: next.hasMore },
      ]);
    } finally {
      setLoadingMore(false);
    }
  };

  // 按日志日期分组（同日多图按日志内顺序）
  const groups = useMemo(() => {
    const map = new Map<string, { date: Date; items: GalleryImage[] }>();
    for (const item of images) {
      const date = item.logDate ?? new Date();
      const key = toDayParam(date);
      const group = map.get(key);
      if (group) {
        group.items.push(item);
      } else {
        map.set(key, { date, items: [item] });
      }
    }
    return Array.from(map.entries()).map(([key, value]) => ({ key, ...value }));
  }, [images]);

  const active = activeIndex === null ? null : images[activeIndex] ?? null;
  const step = (delta: number) => {
    if (activeIndex === null || images.length === 0) return;
    setActiveIndex((activeIndex + delta + images.length) % images.length);
    setShowOriginal(false);
  };
  const dayHref = active?.logDate ? `/?date=${toDayParam(active.logDate)}` : "/";
  const logHref =
    active?.logDate && active.logId
      ? `/?date=${toDayParam(active.logDate)}&log=${encodeURIComponent(active.logId)}`
      : "/";

  return (
    <div className="space-y-6">
      {/* 移动端返回入口（桌面端导航在头部） */}
      <div className="lg:hidden">
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-300"
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
              d="M15 19l-7-7 7-7"
            />
          </svg>
          返回记录
        </Link>
      </div>

      <section
        aria-labelledby="gallery-title"
        className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6 dark:border-slate-700/60 dark:bg-slate-800/70"
      >
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <p
              id="gallery-title"
              className="text-xs uppercase tracking-[0.3em] text-indigo-600 dark:text-indigo-400"
            >
              相册
            </p>
            <h2 className="mt-2 text-xl font-semibold text-slate-900 dark:text-slate-100">
              所有日志图片
            </h2>
          </div>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {firstPage.isLoading ? "加载中…" : `共 ${total} 张图`}
          </span>
        </div>

        {firstPage.isLoading ? (
          <div className="mt-6 grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-5">
            {Array.from({ length: 6 }).map((_, index) => (
              <div
                key={index}
                className="aspect-square animate-pulse rounded-xl bg-slate-100 dark:bg-slate-700/60"
              />
            ))}
          </div>
        ) : groups.length === 0 ? (
          <div className="mt-6 flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 p-10 text-center text-slate-500 dark:border-slate-700 dark:text-slate-400">
            <p className="text-sm uppercase tracking-[0.3em]">还没有图片</p>
            <p className="mt-2 text-xs">
              在记录里点「添加图片」或直接粘贴截图，这里就会按日期归档。
            </p>
          </div>
        ) : (
          <div className="mt-5 space-y-6">
            {groups.map((group) => (
              <div key={group.key}>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                    {formatDayLabel(group.date)}
                    <span className="ml-2 font-normal text-slate-500 dark:text-slate-400">
                      {group.items.length} 张
                    </span>
                  </p>
                  <Link
                    href={`/?date=${group.key}`}
                    className="shrink-0 rounded-full border border-slate-200 px-2.5 py-1 text-[11px] text-slate-500 hover:border-indigo-300 hover:text-indigo-600 dark:border-slate-700 dark:text-slate-400 dark:hover:border-indigo-400 dark:hover:text-indigo-300"
                  >
                    看这天
                  </Link>
                </div>
                <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-5">
                  {group.items.map((item) => {
                    const index = images.findIndex((image) => image.id === item.id);
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          setActiveIndex(index);
                          setShowOriginal(false);
                        }}
                        aria-label={`查看 ${item.name ?? "图片"}（${formatDayLabel(group.date)}）`}
                        className="group relative aspect-square overflow-hidden rounded-xl border border-slate-200 bg-slate-100 transition hover:border-indigo-300 dark:border-slate-700 dark:bg-slate-900"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={imageUrl(item.id, "thumb")}
                          alt={item.name ?? "日志图片"}
                          loading="lazy"
                          decoding="async"
                          className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
                        />
                        {item.logTitle ? (
                          <span className="pointer-events-none absolute inset-x-0 bottom-0 line-clamp-2 bg-gradient-to-t from-slate-900/80 to-transparent px-2 pb-1.5 pt-6 text-left text-[10px] leading-snug text-white opacity-0 transition group-hover:opacity-100">
                            {item.logTitle}
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}

            {hasMore ? (
              <div className="flex justify-center">
                <button
                  type="button"
                  onClick={() => void loadMore()}
                  disabled={loadingMore}
                  className="rounded-full border border-slate-200 px-4 py-2 text-xs text-slate-500 hover:border-indigo-200 hover:text-indigo-600 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:text-slate-400 dark:hover:border-indigo-400 dark:hover:text-indigo-300"
                >
                  {loadingMore ? "加载中…" : "加载更多"}
                </button>
              </div>
            ) : null}
          </div>
        )}
      </section>

      <Dialog
        open={activeIndex !== null}
        onClose={() => setActiveIndex(null)}
        size="lg"
        className="max-w-[min(94vw,1080px)]"
        bodyClassName="relative flex min-h-[220px] items-center justify-center bg-slate-950 p-2"
        title={
          active?.logDate
            ? `${formatDayLabel(active.logDate)} ${formatTime(active.logDate)}`
            : active?.name ?? "查看图片"
        }
        footer={
          <DialogFooter className="flex-col items-stretch gap-2 sm:flex-row sm:items-center">
            <p className="text-xs text-slate-500 dark:text-slate-400 sm:mr-auto">
              {active ? `${active.width}×${active.height}` : ""}
              {active?.size ? ` · 原图 ${formatBytes(active.size)}` : ""}
              {active?.mediumSize ? ` → 压缩 ${formatBytes(active.mediumSize)}` : ""}
            </p>
            <div className="flex items-center justify-end gap-2">
              <DialogButton onClick={() => setShowOriginal((value) => !value)}>
                {showOriginal ? "看压缩图" : "查看原图"}
              </DialogButton>
              <Link
                href={dayHref}
                className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-slate-600 transition hover:border-indigo-200 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
              >
                看这天
              </Link>
              <Link
                href={logHref}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-medium text-white shadow-sm transition hover:bg-indigo-500 dark:bg-indigo-500 dark:hover:bg-indigo-400"
              >
                看这条日志
              </Link>
            </div>
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
              className="max-h-[46vh] w-auto max-w-full object-contain sm:max-h-[62vh]"
            />
            {images.length > 1 ? (
              <>
                <button
                  type="button"
                  onClick={() => step(-1)}
                  aria-label="上一张"
                  className="absolute left-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-slate-900/70 text-white transition hover:bg-slate-900"
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
                  onClick={() => step(1)}
                  aria-label="下一张"
                  className="absolute right-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-slate-900/70 text-white transition hover:bg-slate-900"
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
              </>
            ) : null}
          </>
        ) : null}
      </Dialog>
    </div>
  );
}
