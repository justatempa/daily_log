import type { Prisma } from "@prisma/client";
import { db } from "@/server/db";
import { formatTagGroups, parseTagGroups } from "@/utils/tags";
import { isAiSummaryText } from "@/utils/aiSummary";
import {
  formatDayLabel,
  formatZonedTime,
  isValidDayString,
  zonedDayEndUtc,
  zonedDayStartUtc,
  zonedTimeToUtc,
} from "@/utils/datetime";
import {
  AI_SUMMARY_HASHTAG,
  AI_SUMMARY_SOURCE,
  getAiSettingValues,
  getEnabledProviders,
} from "./config";
import { ensureAiSchema } from "./ensure-schema";
import { buildPrompt, DEFAULT_AI_PROMPT } from "./default-prompt";
import { callChatCompletion } from "./providers";

export type AiTrigger = "AUTO" | "MANUAL";

export type SummaryAttempt = {
  providerId: string;
  providerName: string;
  model: string;
  status: "SUCCESS" | "FAILED";
  error?: string;
  durationMs: number;
};

export type SummaryResult = {
  ok: true;
  logId: string;
  content: string;
  providerName: string;
  model: string;
  durationMs: number;
  targetDay: string;
  attempts: SummaryAttempt[];
};

export type AiSummaryErrorCode = "BAD_DAY" | "NO_PROVIDER" | "NO_LOGS" | "ALL_FAILED";

export class AiSummaryError extends Error {
  readonly code: AiSummaryErrorCode;
  readonly attempts: SummaryAttempt[];

  constructor(
    message: string,
    code: AiSummaryErrorCode,
    attempts: SummaryAttempt[] = [],
  ) {
    super(message);
    this.name = "AiSummaryError";
    this.code = code;
    this.attempts = attempts;
  }
}

/** 单次总结最多送入模型的日志字符数，避免超长日志撑爆上下文 */
const MAX_INPUT_CHARS = 20_000;

/** 总结日志写入被总结当天的 23:59，落在当天时间轴的最后 */
const SUMMARY_LOG_HOUR = 23;
const SUMMARY_LOG_MINUTE = 59;

type LogLineSource = Pick<
  Prisma.LogGetPayload<Record<string, never>>,
  "content" | "tags" | "date" | "isTodo" | "isTodoDone"
>;

const truncate = (text: string, limit: number) => {
  const value = text.trim();
  if (value.length <= limit) return value;
  return `${value.slice(0, limit)}…`;
};

/** 一次总结的 runId，仅用于把多次提供商尝试归为一组（无需密码学强度） */
function createRunId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function capInputText(text: string): string {
  const chars = Array.from(text);
  if (chars.length <= MAX_INPUT_CHARS) return text;
  return `${chars.slice(0, MAX_INPUT_CHARS).join("")}\n…（日志过长，已截断）`;
}

/** 把一条日志（或评论）渲染成一行送入模型的纯文本 */
function renderLogLine(
  log: LogLineSource,
  timeZone: string,
  depth: 0 | 1,
): string[] {
  const content = log.content?.trim() ?? "";
  if (isAiSummaryText(content)) return [];

  const tagText = formatTagGroups(parseTagGroups(log.tags));
  const body = content || (tagText ? `仅标签记录（${tagText}）` : "");
  if (!body) return [];

  const time = formatZonedTime(log.date, timeZone);
  const todo = log.isTodo ? (log.isTodoDone ? "[x] " : "[ ] ") : "";
  const indent = depth === 1 ? "    ↳ " : "";
  const suffix = depth === 0 && tagText ? `（${tagText}）` : "";
  return [`${indent}${time} ${todo}${body}${suffix}`];
}

async function collectDayLogText(params: {
  userId: string;
  day: string;
  timeZone: string;
}): Promise<{ start: Date; end: Date; logsText: string; hasLogs: boolean }> {
  const start = zonedDayStartUtc(params.day, params.timeZone);
  const end = zonedDayEndUtc(params.day, params.timeZone);

  const logs = await db.log.findMany({
    where: {
      userId: params.userId,
      parentId: null,
      date: { gte: start, lt: end },
    },
    orderBy: [{ date: "asc" }, { createdAt: "asc" }],
    include: {
      replies: { orderBy: [{ date: "asc" }, { createdAt: "asc" }] },
    },
  });

  const lines: string[] = [];
  for (const log of logs) {
    const ownLines = renderLogLine(log, params.timeZone, 0);
    if (ownLines.length === 0) continue;
    lines.push(...ownLines);
    for (const reply of log.replies) {
      lines.push(...renderLogLine(reply, params.timeZone, 1));
    }
  }

  const logsText = capInputText(lines.join("\n"));
  return { start, end, logsText, hasLogs: lines.length > 0 };
}

async function recordFailureBeforeProvider(params: {
  userId: string;
  runId: string;
  day: string;
  trigger: AiTrigger;
  targetDate: Date;
  message: string;
}): Promise<void> {
  await db.aiCallLog.create({
    data: {
      userId: params.userId,
      runId: params.runId,
      targetDate: params.targetDate,
      targetDay: params.day,
      trigger: params.trigger,
      providerId: null,
      providerName: "（未调用）",
      model: "—",
      status: "FAILED",
      error: params.message,
      content: null,
      inputChars: 0,
      durationMs: 0,
    },
  });
}

/**
 * 生成并写入某天的 AI 总结。
 *
 * 规则：
 * - 启用中的提供商按添加顺序依次尝试，任一成功即采用；
 * - 每个提供商无论成败都写入一条调用历史；
 * - 全部失败抛出 AiSummaryError（code=ALL_FAILED），不写入总结日志；
 * - 输入日志会排除所有内容里带 #AI总结 的日志（含评论）；
 * - 成功后替换当天已有的 AI 总结日志（source=AI_SUMMARY），再插入 23:59 的新总结。
 */
export async function summarizeDay(params: {
  userId: string;
  day: string;
  trigger: AiTrigger;
}): Promise<SummaryResult> {
  await ensureAiSchema();

  const day = params.day.trim();
  if (!isValidDayString(day)) {
    throw new AiSummaryError(`无效的日期：${day}`, "BAD_DAY");
  }

  const setting = await getAiSettingValues(params.userId);
  const timeZone = setting.timezone;
  const targetDate = zonedDayStartUtc(day, timeZone);
  const runId = createRunId();
  const providers = await getEnabledProviders(params.userId);

  if (providers.length === 0) {
    const message =
      "没有启用中的 AI 提供商，请先在「AI 总结配置」中添加并启用。";
    await recordFailureBeforeProvider({
      userId: params.userId,
      runId,
      day,
      trigger: params.trigger,
      targetDate,
      message,
    });
    throw new AiSummaryError(message, "NO_PROVIDER");
  }

  const collected = await collectDayLogText({
    userId: params.userId,
    day,
    timeZone,
  });

  if (!collected.hasLogs) {
    const message = `「${day}」没有可总结的日志（带 ${AI_SUMMARY_HASHTAG} 的日志已排除）。`;
    await recordFailureBeforeProvider({
      userId: params.userId,
      runId,
      day,
      trigger: params.trigger,
      targetDate,
      message,
    });
    throw new AiSummaryError(message, "NO_LOGS");
  }

  const prompt = buildPrompt(setting.prompt || DEFAULT_AI_PROMPT, {
    date: formatDayLabel(day),
    logs: collected.logsText,
  });
  const inputChars = Array.from(collected.logsText).length;

  const attempts: SummaryAttempt[] = [];

  for (const provider of providers) {
    const startedAt = Date.now();
    try {
      const result = await callChatCompletion({
        provider: {
          name: provider.name,
          baseUrl: provider.baseUrl,
          apiKey: provider.apiKey,
          model: provider.model,
        },
        messages: [
          {
            role: "system",
            content:
              "你是一名严谨、克制的中文日记总结助手，只依据用户提供的日志做总结。",
          },
          { role: "user", content: prompt },
        ],
        temperature: 0.4,
      });

      const content = result.content.trim();
      if (!content) {
        throw new Error("模型返回内容为空");
      }

      await db.aiCallLog.create({
        data: {
          userId: params.userId,
          runId,
          targetDate,
          targetDay: day,
          trigger: params.trigger,
          providerId: provider.id,
          providerName: provider.name,
          model: provider.model,
          status: "SUCCESS",
          error: null,
          content,
          inputChars,
          durationMs: result.durationMs,
        },
      });

      const summaryContent = `${content}\n\n${AI_SUMMARY_HASHTAG}`;
      const summaryDate = zonedTimeToUtc(
        day,
        SUMMARY_LOG_HOUR,
        SUMMARY_LOG_MINUTE,
        timeZone,
      );

      const [, createdLog] = await db.$transaction([
        db.log.deleteMany({
          where: {
            userId: params.userId,
            source: AI_SUMMARY_SOURCE,
            date: { gte: collected.start, lt: collected.end },
          },
        }),
        db.log.create({
          data: {
            userId: params.userId,
            content: summaryContent,
            date: summaryDate,
            tags: "",
            isTodo: false,
            isTodoDone: false,
            parentId: null,
            source: AI_SUMMARY_SOURCE,
          },
        }),
      ]);

      attempts.push({
        providerId: provider.id,
        providerName: provider.name,
        model: provider.model,
        status: "SUCCESS",
        durationMs: result.durationMs,
      });

      return {
        ok: true,
        logId: createdLog.id,
        content,
        providerName: provider.name,
        model: provider.model,
        durationMs: result.durationMs,
        targetDay: day,
        attempts,
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error ?? "未知错误");
      const durationMs = Date.now() - startedAt;

      await db.aiCallLog.create({
        data: {
          userId: params.userId,
          runId,
          targetDate,
          targetDay: day,
          trigger: params.trigger,
          providerId: provider.id,
          providerName: provider.name,
          model: provider.model,
          status: "FAILED",
          error: truncate(message, 2000),
          content: null,
          inputChars,
          durationMs,
        },
      });

      attempts.push({
        providerId: provider.id,
        providerName: provider.name,
        model: provider.model,
        status: "FAILED",
        error: truncate(message, 500),
        durationMs,
      });
    }
  }

  const detail = attempts
    .map((attempt) => `${attempt.providerName}：${attempt.error ?? "未知错误"}`)
    .join("；");
  throw new AiSummaryError(
    `所有 ${attempts.length} 个启用的 AI 提供商都调用失败。${detail}`,
    "ALL_FAILED",
    attempts,
  );
}

/**
 * 测试单个提供商连通性（会写入一条 trigger=TEST 的调用历史）。
 * 不抛错，返回 ok=false + 原因，便于前端直接展示。
 */
export async function testAiProvider(
  userId: string,
  providerId: string,
): Promise<
  | { ok: true; message: string; durationMs: number }
  | { ok: false; error: string; durationMs: number }
> {
  await ensureAiSchema();

  const provider = await db.aiProvider.findFirst({
    where: { id: providerId, userId },
  });
  if (!provider) {
    return { ok: false, error: "提供商不存在或无权访问", durationMs: 0 };
  }

  const runId = createRunId();
  const startedAt = Date.now();

  try {
    const result = await callChatCompletion({
      provider: {
        name: provider.name,
        baseUrl: provider.baseUrl,
        apiKey: provider.apiKey,
        model: provider.model,
      },
      messages: [{ role: "user", content: "请只回复两个字：正常" }],
      temperature: 0,
      timeoutMs: 30_000,
    });

    await db.aiCallLog.create({
      data: {
        userId,
        runId,
        targetDate: null,
        targetDay: null,
        trigger: "TEST",
        providerId: provider.id,
        providerName: provider.name,
        model: provider.model,
        status: "SUCCESS",
        error: null,
        content: result.content,
        inputChars: 0,
        durationMs: result.durationMs,
      },
    });

    return { ok: true, message: result.content, durationMs: result.durationMs };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : String(error ?? "未知错误");
    const durationMs = Date.now() - startedAt;

    await db.aiCallLog.create({
      data: {
        userId,
        runId,
        targetDate: null,
        targetDay: null,
        trigger: "TEST",
        providerId: provider.id,
        providerName: provider.name,
        model: provider.model,
        status: "FAILED",
        error: truncate(message, 2000),
        content: null,
        inputChars: 0,
        durationMs,
      },
    });

    return {
      ok: false,
      error: truncate(message, 500),
      durationMs,
    };
  }
}
