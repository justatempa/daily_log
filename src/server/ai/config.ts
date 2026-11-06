import type { AiProvider } from "@prisma/client";
import { db } from "@/server/db";
import { isValidTimeZone } from "@/utils/datetime";
import { DEFAULT_AI_PROMPT } from "./default-prompt";

export const DEFAULT_TIMEZONE = "Asia/Shanghai";
export const DEFAULT_SCHEDULE_HOUR = 0;
export const DEFAULT_SCHEDULE_MINUTE = 30;

/** 写入总结日志时带的行内 hashtag */
export const AI_SUMMARY_HASHTAG = "#AI总结";
/** Log.source 取值：由 AI 总结写入（重新总结时会被替换） */
export const AI_SUMMARY_SOURCE = "AI_SUMMARY";

export type AiSettingValues = {
  prompt: string;
  autoEnabled: boolean;
  timezone: string;
  scheduleHour: number;
  scheduleMinute: number;
  lastAutoRunDay: string | null;
};

/** 读取用户配置；没有配置时返回默认值（不写库） */
export async function getAiSettingValues(userId: string): Promise<AiSettingValues> {
  const setting = await db.aiSetting.findUnique({ where: { userId } });
  const timezone =
    setting?.timezone && isValidTimeZone(setting.timezone)
      ? setting.timezone
      : DEFAULT_TIMEZONE;
  return {
    prompt: setting?.prompt?.trim() ? setting.prompt : DEFAULT_AI_PROMPT,
    autoEnabled: setting?.autoEnabled ?? true,
    timezone,
    scheduleHour: setting?.scheduleHour ?? DEFAULT_SCHEDULE_HOUR,
    scheduleMinute: setting?.scheduleMinute ?? DEFAULT_SCHEDULE_MINUTE,
    lastAutoRunDay: setting?.lastAutoRunDay ?? null,
  };
}

/** 启用中的提供商，按添加顺序依次尝试 */
export async function getEnabledProviders(userId: string): Promise<AiProvider[]> {
  return db.aiProvider.findMany({
    where: { userId, enabled: true },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
}

/** Key 脱敏：sk-abcdefgh -> sk-****efgh */
export function maskApiKey(apiKey: string): string {
  const value = apiKey.trim();
  if (!value) return "";
  if (value.length <= 8) return "****";
  return `${value.slice(0, 3)}****${value.slice(-4)}`;
}
