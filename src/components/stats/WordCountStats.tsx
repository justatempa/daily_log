"use client";

import { useMemo } from "react";
import { api } from "@/utils/api";

/** 柱状图最高柱子的高度（px） */
const BAR_MAX_HEIGHT = 56;

/**
 * 字数统计卡片：展示某个月份每日的字数柱状图 + 本月总计 / 日均 / 今日字数。
 * 数据来自 log.getStats（每条日志/评论按其自身 date 归属到本地时区的某天），
 * 发送日志/评论后前端刷新数据即更新；页面刷新重新拉取也会更新。
 */
export default function WordCountStats({ monthDate }: { monthDate: Date }) {
  const { year, month } = useMemo(
    () => ({
      year: monthDate.getFullYear(),
      month: monthDate.getMonth(),
    }),
    [monthDate],
  );

  // 与 getByDate 同一模式：客户端按本地时区给出月初/下月初，服务端不换算时区
  const range = useMemo(() => {
    const start = new Date(year, month, 1, 0, 0, 0, 0);
    const end = new Date(year, month + 1, 1, 0, 0, 0, 0);
    return { start, end };
  }, [year, month]);

  const { data } = api.log.getStats.useQuery(range);

  const stats = useMemo(() => {
    const perDay = new Map<number, number>();
    for (const item of data ?? []) {
      const date = new Date(item.date);
      if (date.getFullYear() !== year || date.getMonth() !== month) continue;
      const day = date.getDate();
      perDay.set(day, (perDay.get(day) ?? 0) + item.count);
    }

    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const today = new Date();
    const todayInMonth =
      today.getFullYear() === year && today.getMonth() === month
        ? today.getDate()
        : -1;

    let total = 0;
    const bars: {
      day: number;
      count: number;
      isToday: boolean;
      height: number;
    }[] = [];
    for (let day = 1; day <= daysInMonth; day++) {
      const count = perDay.get(day) ?? 0;
      total += count;
      bars.push({ day, count, isToday: day === todayInMonth, height: 0 });
    }

    const max = Math.max(1, ...bars.map((bar) => bar.count));
    for (const bar of bars) {
      bar.height =
        bar.count === 0
          ? 2
          : Math.max(4, Math.round((bar.count / max) * BAR_MAX_HEIGHT));
    }

    const todayCount = todayInMonth > 0 ? perDay.get(todayInMonth) ?? 0 : 0;
    const avg = Math.round(total / daysInMonth);
    return { bars, total, avg, todayCount };
  }, [data, year, month]);

  const monthLabel = new Date(year, month, 1).toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "long",
  });

  return (
    <section
      aria-labelledby="word-count-stats"
      className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700/60 dark:bg-slate-800/70"
    >
      <div className="flex items-baseline justify-between">
        <h3
          id="word-count-stats"
          className="text-sm font-semibold text-slate-700 dark:text-slate-200"
        >
          字数统计
        </h3>
        <span className="text-xs text-slate-500 dark:text-slate-400">
          {monthLabel}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
        <span>
          本月{" "}
          <span className="font-semibold text-slate-700 dark:text-slate-200">
            {stats.total}
          </span>{" "}
          字
        </span>
        <span>
          日均{" "}
          <span className="font-semibold text-slate-700 dark:text-slate-200">
            {stats.avg}
          </span>{" "}
          字
        </span>
        {stats.todayCount > 0 && (
          <span>
            今日{" "}
            <span className="font-semibold text-indigo-600 dark:text-indigo-300">
              {stats.todayCount}
            </span>{" "}
            字
          </span>
        )}
      </div>

      <div
        role="img"
        aria-label={`${monthLabel}每日字数柱状图`}
        className="mt-3 flex h-14 items-end gap-[2px]"
      >
        {stats.bars.map((bar) => (
          <div
            key={bar.day}
            title={`${month + 1}月${bar.day}日：${bar.count} 字`}
            aria-label={`${bar.day}日 ${bar.count}字`}
            className={`min-w-0 flex-1 rounded-t-sm transition-colors ${
              bar.count === 0
                ? "bg-slate-100 dark:bg-slate-700/40"
                : bar.isToday
                  ? "bg-indigo-600 dark:bg-indigo-400"
                  : "bg-indigo-400/70 hover:bg-indigo-500 dark:bg-indigo-500/60 dark:hover:bg-indigo-400"
            }`}
            style={{ height: `${bar.height}px` }}
          />
        ))}
      </div>

      {stats.total === 0 && (
        <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">
          本月还没有记录，去写点什么吧。
        </p>
      )}
    </section>
  );
}
