import { db } from "@/server/db";
import {
  addDaysToDayString,
  getZonedParts,
  isValidTimeZone,
  toZonedDayString,
} from "@/utils/datetime";
import { notifyAutoSummaryBark } from "./bark";
import {
  DEFAULT_TIMEZONE,
  DEFAULT_SCHEDULE_HOUR,
  DEFAULT_SCHEDULE_MINUTE,
} from "./config";
import { DEFAULT_AI_PROMPT } from "./default-prompt";
import { ensureAiSchema } from "./ensure-schema";
import { summarizeDay } from "./summary";

/**
 * 每日自动总结调度器。
 *
 * 没有引入额外依赖：进程内每分钟检查一次，按用户配置的时区判断
 * 「今天是否已过 00:30 且还没跑过」，满足条件就总结该时区的「前一天」。
 * 用 lastAutoRunDay 标记，避免重复；应用重启后当天仍会自动补跑一次。
 */

let started = false;
let tickRunning = false;

function log(message: string, ...rest: unknown[]) {
  console.log(`[ai-summary] ${message}`, ...rest);
}

export function startAiSummaryScheduler(): void {
  if (started) return;
  started = true;
  log("scheduler started (check every 60s)");

  const timer = setInterval(() => {
    void tick();
  }, 60_000);
  timer.unref?.();

  const bootTimer = setTimeout(() => {
    void tick();
  }, 8_000);
  bootTimer.unref?.();
}

async function tick(): Promise<void> {
  if (tickRunning) return;
  tickRunning = true;

  try {
    await ensureAiSchema();

    const users = await db.user.findMany({
      where: {
        isActive: true,
        aiProviders: { some: { enabled: true } },
      },
      select: { id: true, aiSetting: true },
    });

    if (users.length === 0) return;

    for (const user of users) {
      const setting = user.aiSetting;
      if (setting && !setting.autoEnabled) continue;

      const timeZone =
        setting?.timezone && isValidTimeZone(setting.timezone)
          ? setting.timezone
          : DEFAULT_TIMEZONE;
      const scheduleHour = setting?.scheduleHour ?? DEFAULT_SCHEDULE_HOUR;
      const scheduleMinute =
        setting?.scheduleMinute ?? DEFAULT_SCHEDULE_MINUTE;

      const now = new Date();
      let nowDay: string;
      let nowParts: ReturnType<typeof getZonedParts>;
      try {
        nowDay = toZonedDayString(now, timeZone);
        nowParts = getZonedParts(now, timeZone);
      } catch (error) {
        log("invalid timezone, skipped", { userId: user.id, timeZone, error });
        continue;
      }

      const nowMinutes = nowParts.hour * 60 + nowParts.minute;
      const targetMinutes = scheduleHour * 60 + scheduleMinute;
      if (nowMinutes < targetMinutes) continue;
      if (setting?.lastAutoRunDay === nowDay) continue;

      const targetDay = addDaysToDayString(nowDay, -1);

      // 先占位再执行：避免一次总结耗时较长时被下一次 tick 重复触发
      await db.aiSetting.upsert({
        where: { userId: user.id },
        update: { lastAutoRunDay: nowDay },
        create: {
          userId: user.id,
          prompt: DEFAULT_AI_PROMPT,
          lastAutoRunDay: nowDay,
        },
      });

      log("auto summary start", {
        userId: user.id,
        targetDay,
        timeZone,
      });

      try {
        const result = await summarizeDay({
          userId: user.id,
          day: targetDay,
          trigger: "AUTO",
        });
        log("auto summary success", {
          userId: user.id,
          targetDay,
          provider: result.providerName,
          durationMs: result.durationMs,
        });
        await notifyAutoSummaryBark({
          day: targetDay,
          providerName: result.providerName,
          content: result.content,
          durationMs: result.durationMs,
        });
      } catch (error) {
        log("auto summary failed", {
          userId: user.id,
          targetDay,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  } catch (error) {
    log("scheduler tick error", error);
  } finally {
    tickRunning = false;
  }
}
