"use client";

import { useMemo, useState } from "react";
import { api } from "@/utils/api";

const WEEKDAYS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function toCalendarDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12);
}

/** 生成本地时区的 YYYY-MM-DD，用作日期按钮的可访问名称 */
function toISODate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export default function Calendar({
  selectedDate,
  onSelectDate,
}: {
  selectedDate: Date;
  onSelectDate: (date: Date) => void;
}) {
  const [currentMonth, setCurrentMonth] = useState(startOfMonth(selectedDate));
  // year/month 用浏览器本地时区，避免服务器时区导致月份错位；
  // 返回的是日志时间戳，在本地时区换算成「日」并严格过滤到当前月
  const { data: monthLogDates = [] } = api.log.getMonthDays.useQuery({
    year: currentMonth.getFullYear(),
    month: currentMonth.getMonth(),
  });
  const daysWithLogs = useMemo(() => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    return new Set(
      monthLogDates
        .map((value) => new Date(value))
        .filter(
          (date) =>
            date.getFullYear() === year && date.getMonth() === month,
        )
        .map((date) => date.getDate()),
    );
  }, [monthLogDates, currentMonth]);

  const days = useMemo(() => {
    const start = startOfMonth(currentMonth);
    const startWeekday = start.getDay();
    const gridStart = addDays(start, -startWeekday);
    return Array.from({ length: 42 }, (_, index) => {
      const date = addDays(gridStart, index);
      return {
        date: toCalendarDay(date),
        label: date.getDate(),
        inMonth: date.getMonth() === currentMonth.getMonth(),
      };
    });
  }, [currentMonth]);

  const monthLabel = currentMonth.toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "long",
  });

  return (
    <section
      aria-labelledby="calendar-month"
      className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700/60 dark:bg-slate-800/70"
    >
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() =>
            setCurrentMonth(
              new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1),
            )
          }
          aria-label="上个月"
          className="rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-500 hover:border-indigo-300 hover:text-indigo-600 dark:border-slate-700 dark:text-slate-400 dark:hover:border-indigo-400 dark:hover:text-indigo-300"
        >
          上月
        </button>
        <div
          id="calendar-month"
          className="text-sm font-semibold text-slate-700 dark:text-slate-200"
        >
          {monthLabel}
        </div>
        <button
          type="button"
          onClick={() =>
            setCurrentMonth(
              new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1),
            )
          }
          aria-label="下个月"
          className="rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-500 hover:border-indigo-300 hover:text-indigo-600 dark:border-slate-700 dark:text-slate-400 dark:hover:border-indigo-400 dark:hover:text-indigo-300"
        >
          下月
        </button>
      </div>

      <div
        aria-hidden="true"
        className="mt-4 grid grid-cols-7 gap-1 text-xs uppercase tracking-widest text-slate-500 dark:text-slate-400"
      >
        {WEEKDAYS.map((day) => (
          <div key={day} className="text-center">
            {day}
          </div>
        ))}
      </div>
      <div className="mt-2 grid grid-cols-7 gap-1 text-sm">
        {days.map((day) => {
          const isSelected =
            day.date.toDateString() === selectedDate.toDateString();
          const hasLogs = day.inMonth && daysWithLogs.has(day.date.getDate());
          return (
            <button
              key={day.date.toISOString()}
              type="button"
              onClick={() => onSelectDate(day.date)}
              disabled={!day.inMonth}
              aria-label={toISODate(day.date)}
              aria-pressed={isSelected}
              aria-current={isSelected ? "date" : undefined}
              className={`flex h-10 flex-col items-center justify-center rounded-lg transition ${
                day.inMonth
                  ? "text-slate-700 hover:bg-indigo-50 dark:text-slate-200 dark:hover:bg-indigo-500/15"
                  : "text-slate-500 dark:text-slate-400"
              } ${
                isSelected
                  ? "bg-indigo-600 text-white hover:bg-indigo-600 dark:bg-indigo-600 dark:hover:bg-indigo-600"
                  : ""
              }`}
            >
              <span>{day.label}</span>
              {hasLogs ? (
                <span
                  aria-hidden="true"
                  className={`mt-0.5 h-1 w-1 rounded-full ${
                    isSelected ? "bg-white" : "bg-indigo-500 dark:bg-indigo-400"
                  }`}
                />
              ) : (
                <span aria-hidden="true" className="mt-0.5 h-1 w-1" />
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}