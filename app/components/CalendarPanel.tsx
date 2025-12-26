'use client';

import { useMemo, useState } from 'react';
import type { Holiday } from '@/lib/holidays.service';

interface CalendarPanelProps {
  selectedDate: Date;
  onDateSelect: (date: Date) => void;
  recordDates?: string[];
  holidays?: Holiday[];
}

export default function CalendarPanel({
  selectedDate,
  onDateSelect,
  recordDates = [],
  holidays = [],
}: CalendarPanelProps) {
  const [currentMonth, setCurrentMonth] = useState(new Date(selectedDate));

  const holidayMap = useMemo(() => {
    const map: Record<string, Holiday[]> = {};
    holidays.forEach((holiday) => {
      const key = holiday.holiday_date;
      if (!map[key]) {
        map[key] = [];
      }
      map[key].push(holiday);
    });
    return map;
  }, [holidays]);

  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();

  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const firstDayIndex = firstDay.getDay();
  const prevMonthLastDay = new Date(year, month, 0).getDate();

  const prevMonth = () => {
    setCurrentMonth(new Date(year, month - 1, 1));
  };

  const nextMonth = () => {
    setCurrentMonth(new Date(year, month + 1, 1));
  };

  const isSameDay = (date1: Date, date2: Date) => {
    return (
      date1.getFullYear() === date2.getFullYear() &&
      date1.getMonth() === date2.getMonth() &&
      date1.getDate() === date2.getDate()
    );
  };

  const formatDate = (date: Date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  const hasRecords = (date: Date) => {
    return recordDates.includes(formatDate(date));
  };

  const getHolidaysForDate = (date: Date) => {
    return holidayMap[formatDate(date)] || [];
  };

  const formatHolidayTooltip = (dayHolidays: Holiday[]) => {
    if (dayHolidays.length === 0) return undefined;
    const labels = dayHolidays
      .map((holiday) => holiday.name_cn || holiday.name || holiday.name_en)
      .filter((label): label is string => Boolean(label));
    const statuses = Array.from(
      new Set(dayHolidays.map((holiday) => (holiday.is_workday ? '补班' : '假期')))
    );
    const labelText = labels.join(' / ');
    return `${labelText}${statuses.length ? `（${statuses.join('、')}）` : ''}`;
  };

  const renderCalendarDays = () => {
    const days = [];
    const today = new Date();

    // Previous month days
    for (let i = firstDayIndex; i > 0; i--) {
      const day = prevMonthLastDay - i + 1;
      days.push(
        <div
          key={`prev-${day}`}
          className="flex items-center justify-center h-8 w-8 rounded-lg text-neutral-300 text-xs cursor-default"
        >
          {day}
        </div>
      );
    }

    // Current month days
    for (let i = 1; i <= lastDay.getDate(); i++) {
      const date = new Date(year, month, i);
      const isToday = isSameDay(date, today);
      const isSelected = isSameDay(date, selectedDate);
      const hasRecord = hasRecords(date);
      const dayHolidays = getHolidaysForDate(date);
      const hasHoliday = dayHolidays.length > 0;
      const hasWorkdayOverride = dayHolidays.some(
        (holiday) => holiday.is_workday
      );
      const holidayTooltip = formatHolidayTooltip(dayHolidays);

      let dayClasses = 'flex flex-col items-center justify-center h-8 w-8 rounded-lg transition-all duration-200 cursor-pointer relative text-xs font-medium';

      if (isSelected) {
        dayClasses += ' gradient-primary text-white shadow-md scale-105';
      } else if (isToday) {
        dayClasses += ' bg-primary-50 text-primary-600 ring-1 ring-primary-200';
      } else {
        dayClasses += ' text-neutral-700 hover:bg-neutral-100';
      }

      days.push(
        <div
          key={`current-${i}`}
          className={dayClasses}
          title={holidayTooltip}
          onClick={() => onDateSelect(date)}
        >
          <span>{i}</span>
          {(hasRecord || hasHoliday) && (
            <div className="absolute bottom-0.5 flex gap-0.5">
              {hasRecord && (
                <span className="w-1 h-1 rounded-full bg-primary-400" />
              )}
              {hasHoliday && (
                <span
                  className={`w-1 h-1 rounded-full ${
                    hasWorkdayOverride ? 'bg-amber-400' : 'bg-rose-400'
                  }`}
                />
              )}
            </div>
          )}
        </div>
      );
    }

    // Next month days
    const remainingDays = 42 - (firstDayIndex + lastDay.getDate());
    for (let i = 1; i <= remainingDays; i++) {
      days.push(
        <div
          key={`next-${i}`}
          className="flex items-center justify-center h-8 w-8 rounded-lg text-neutral-300 text-xs cursor-default"
        >
          {i}
        </div>
      );
    }

    return days;
  };

  return (
    <div className="card-elevated p-3.5 animate-slide-up">
      <div className="flex justify-between items-center mb-3">
        <button
          onClick={prevMonth}
          className="w-8 h-8 rounded-lg bg-neutral-100 hover:bg-neutral-200 flex items-center justify-center transition-all hover:scale-105 active:scale-95"
          aria-label="上个月"
        >
          <i className="fas fa-chevron-left text-neutral-600 text-xs"></i>
        </button>

        <div className="text-center">
          <div className="text-base font-bold text-dark">{year}年</div>
          <div className="text-lg font-bold text-primary-600">{month + 1}月</div>
        </div>

        <button
          onClick={nextMonth}
          className="w-8 h-8 rounded-lg bg-neutral-100 hover:bg-neutral-200 flex items-center justify-center transition-all hover:scale-105 active:scale-95"
          aria-label="下个月"
        >
          <i className="fas fa-chevron-right text-neutral-600 text-xs"></i>
        </button>
      </div>

      {/* Week days */}
      <div className="grid grid-cols-7 gap-0.5 mb-2">
        {['日', '一', '二', '三', '四', '五', '六'].map((day, index) => (
          <div
            key={day}
            className={`text-center text-[0.6rem] font-semibold ${
              index === 0 || index === 6 ? 'text-primary-500' : 'text-neutral-500'
            }`}
          >
            {day}
          </div>
        ))}
      </div>

      {/* Calendar days */}
      <div className="grid grid-cols-7 gap-0.5 mb-3">{renderCalendarDays()}</div>

      {/* Legend */}
      <div className="flex justify-between items-center pt-2.5 border-t border-neutral-200">
        <div className="flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-primary-400" />
          <span className="text-[0.6rem] text-neutral-600">记录</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
          <span className="text-[0.6rem] text-neutral-600">假期</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
          <span className="text-[0.6rem] text-neutral-600">补班</span>
        </div>
      </div>
    </div>
  );
}
