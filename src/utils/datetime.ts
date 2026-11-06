/**
 * 时区与「日」边界工具（服务端与客户端共用）
 *
 * 日志的 date 是一个 instant，但「哪一天」由时区决定。AI 定时总结在服务端运行，
 * 不能依赖服务器本地时区，因此统一用 IANA 时区计算目标日期的起止瞬间。
 */

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function getFormatter(timeZone: string) {
  let formatter = formatterCache.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
    formatterCache.set(timeZone, formatter);
  }
  return formatter;
}

export type ZonedParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

export function isValidTimeZone(timeZone: string): boolean {
  if (!timeZone.trim()) return false;
  try {
    getFormatter(timeZone);
    return true;
  } catch {
    return false;
  }
}

export function getZonedParts(date: Date, timeZone: string): ZonedParts {
  const parts = getFormatter(timeZone).formatToParts(date);
  const result: Partial<ZonedParts> = {};
  for (const part of parts) {
    if (part.type === "literal") continue;
    if (
      part.type === "year" ||
      part.type === "month" ||
      part.type === "day" ||
      part.type === "hour" ||
      part.type === "minute" ||
      part.type === "second"
    ) {
      result[part.type] = Number(part.value);
    }
  }
  return {
    year: result.year ?? 1970,
    month: result.month ?? 1,
    day: result.day ?? 1,
    hour: result.hour ?? 0,
    minute: result.minute ?? 0,
    second: result.second ?? 0,
  };
}

const pad2 = (value: number) => String(value).padStart(2, "0");

/** 某个 instant 在指定时区的日期键：YYYY-MM-DD */
export function toZonedDayString(date: Date, timeZone: string): string {
  const parts = getZonedParts(date, timeZone);
  return `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}`;
}

/** 客户端本地时区的日期键：YYYY-MM-DD */
export function toLocalDayString(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

/** 解析 YYYY-MM-DD，并校验是真实存在的日期 */
export function parseDayString(day: string): {
  year: number;
  month: number;
  day: number;
} | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const dayOfMonth = Number(match[3]);
  if (month < 1 || month > 12 || dayOfMonth < 1 || dayOfMonth > 31) return null;
  const probe = new Date(Date.UTC(year, month - 1, dayOfMonth));
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== dayOfMonth
  ) {
    return null;
  }
  return { year, month, day: dayOfMonth };
}

export function isValidDayString(day: string): boolean {
  return parseDayString(day) !== null;
}

function getTimeZoneOffsetMs(date: Date, timeZone: string): number {
  const parts = getZonedParts(date, timeZone);
  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
    date.getMilliseconds(),
  );
  return asUtc - date.getTime();
}

/**
 * 把「某时区的某天某时某分」换算成 UTC instant。
 * 采用两次偏移校正，能覆盖绝大多数夏令时边界。
 */
export function zonedTimeToUtc(
  day: string,
  hour: number,
  minute: number,
  timeZone: string,
): Date {
  const parsed = parseDayString(day);
  if (!parsed) {
    throw new Error(`无效的日期：${day}`);
  }
  const guess = Date.UTC(parsed.year, parsed.month - 1, parsed.day, hour, minute, 0, 0);
  let timestamp = guess - getTimeZoneOffsetMs(new Date(guess), timeZone);
  timestamp = guess - getTimeZoneOffsetMs(new Date(timestamp), timeZone);
  return new Date(timestamp);
}

/** 指定时区某天的 00:00 对应的 instant */
export function zonedDayStartUtc(day: string, timeZone: string): Date {
  return zonedTimeToUtc(day, 0, 0, timeZone);
}

/** 指定时区某天的次日 00:00 对应的 instant（左闭右开区间的终点） */
export function zonedDayEndUtc(day: string, timeZone: string): Date {
  return zonedDayStartUtc(addDaysToDayString(day, 1), timeZone);
}

/** 日期键加减天数 */
export function addDaysToDayString(day: string, days: number): string {
  const parsed = parseDayString(day);
  if (!parsed) throw new Error(`无效的日期：${day}`);
  const date = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day));
  date.setUTCDate(date.getUTCDate() + days);
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(
    date.getUTCDate(),
  )}`;
}

const WEEKDAY_LABELS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

/** 2026-11-05 -> 2026-11-05（周三） */
export function formatDayLabel(day: string): string {
  const parsed = parseDayString(day);
  if (!parsed) return day;
  const weekday = new Date(
    Date.UTC(parsed.year, parsed.month - 1, parsed.day),
  ).getUTCDay();
  return `${day}（${WEEKDAY_LABELS[weekday]}）`;
}

/** 指定时区的 HH:mm */
export function formatZonedTime(date: Date, timeZone: string): string {
  const parts = getZonedParts(date, timeZone);
  return `${pad2(parts.hour)}:${pad2(parts.minute)}`;
}

/** 指定时区的 YYYY-MM-DD HH:mm */
export function formatZonedDateTime(date: Date, timeZone: string): string {
  const parts = getZonedParts(date, timeZone);
  return `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)} ${pad2(
    parts.hour,
  )}:${pad2(parts.minute)}`;
}
