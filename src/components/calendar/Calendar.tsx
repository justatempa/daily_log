"use client";

import { useMemo, useState } from "react";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

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

export default function Calendar({
  selectedDate,
  onSelectDate,
}: {
  selectedDate: Date;
  onSelectDate: (date: Date) => void;
}) {
  const [currentMonth, setCurrentMonth] = useState(startOfMonth(selectedDate));

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

  const monthLabel = currentMonth.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
  });

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() =>
            setCurrentMonth(
              new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1),
            )
          }
          className="rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-500 hover:border-indigo-300 hover:text-indigo-600"
        >
          Prev
        </button>
        <div className="text-sm font-semibold text-slate-700">{monthLabel}</div>
        <button
          type="button"
          onClick={() =>
            setCurrentMonth(
              new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1),
            )
          }
          className="rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-500 hover:border-indigo-300 hover:text-indigo-600"
        >
          Next
        </button>
      </div>

      <div className="mt-4 grid grid-cols-7 gap-1 text-[11px] uppercase tracking-widest text-slate-400">
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
          return (
            <button
              key={day.date.toISOString()}
              type="button"
              onClick={() => onSelectDate(day.date)}
              disabled={!day.inMonth}
              className={`h-9 rounded-lg transition ${
                day.inMonth
                  ? "text-slate-700 hover:bg-indigo-50"
                  : "text-slate-300"
              } ${
                isSelected
                  ? "bg-indigo-500 text-white hover:bg-indigo-500"
                  : ""
              }`}
            >
              {day.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
