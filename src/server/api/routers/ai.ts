import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "@/server/api/trpc";
import {
  DEFAULT_SCHEDULE_HOUR,
  DEFAULT_SCHEDULE_MINUTE,
  DEFAULT_TIMEZONE,
  maskApiKey,
} from "@/server/ai/config";
import { DEFAULT_AI_PROMPT } from "@/server/ai/default-prompt";
import { ensureAiSchema } from "@/server/ai/ensure-schema";
import { isValidTimeZone } from "@/utils/datetime";

/** AI 相关接口第一次访问时兜底补一次表结构（启动钩子失败时也能用） */
const aiProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  try {
    await ensureAiSchema();
  } catch (error) {
    console.error("[ai-summary] ensure schema in trpc failed", error);
  }
  return next({ ctx });
});

const baseUrlSchema = z
  .string()
  .trim()
  .min(1, "请填写接口地址")
  .max(500)
  .refine(
    (value) => {
      try {
        const url = new URL(value);
        return url.protocol === "http:" || url.protocol === "https:";
      } catch {
        return false;
      }
    },
    { message: "接口地址需以 http:// 或 https:// 开头" },
  );

export const aiRouter = router({
  /** 配置页一次性拉取：设置 + 提供商列表（Key 脱敏） */
  getSetting: aiProcedure.query(async ({ ctx }) => {
    const userId = ctx.session!.user.id;
    const [setting, providers] = await Promise.all([
      ctx.db.aiSetting.findUnique({ where: { userId } }),
      ctx.db.aiProvider.findMany({
        where: { userId },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      }),
    ]);

    const timezone =
      setting?.timezone && isValidTimeZone(setting.timezone)
        ? setting.timezone
        : DEFAULT_TIMEZONE;

    return {
      prompt: setting?.prompt?.trim() ? setting.prompt : DEFAULT_AI_PROMPT,
      defaultPrompt: DEFAULT_AI_PROMPT,
      autoEnabled: setting?.autoEnabled ?? true,
      timezone,
      scheduleHour: setting?.scheduleHour ?? DEFAULT_SCHEDULE_HOUR,
      scheduleMinute: setting?.scheduleMinute ?? DEFAULT_SCHEDULE_MINUTE,
      lastAutoRunDay: setting?.lastAutoRunDay ?? null,
      providers: providers.map((provider) => ({
        id: provider.id,
        name: provider.name,
        baseUrl: provider.baseUrl,
        model: provider.model,
        enabled: provider.enabled,
        apiKeyMasked: maskApiKey(provider.apiKey),
        hasApiKey: Boolean(provider.apiKey.trim()),
        createdAt: provider.createdAt,
      })),
    };
  }),

  updateSchedule: aiProcedure
    .input(
      z.object({
        autoEnabled: z.boolean(),
        timezone: z
          .string()
          .trim()
          .min(1, "请填写时区")
          .max(64)
          .refine((value) => isValidTimeZone(value), {
            message: "无效的时区，例如 Asia/Shanghai",
          }),
        scheduleHour: z.number().int().min(0).max(23),
        scheduleMinute: z.number().int().min(0).max(59),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session!.user.id;
      await ctx.db.aiSetting.upsert({
        where: { userId },
        update: {
          autoEnabled: input.autoEnabled,
          timezone: input.timezone,
          scheduleHour: input.scheduleHour,
          scheduleMinute: input.scheduleMinute,
        },
        create: {
          userId,
          prompt: DEFAULT_AI_PROMPT,
          autoEnabled: input.autoEnabled,
          timezone: input.timezone,
          scheduleHour: input.scheduleHour,
          scheduleMinute: input.scheduleMinute,
        },
      });
      return { ok: true };
    }),

  updatePrompt: aiProcedure
    .input(z.object({ prompt: z.string().trim().min(1).max(10_000) }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session!.user.id;
      await ctx.db.aiSetting.upsert({
        where: { userId },
        update: { prompt: input.prompt },
        create: { userId, prompt: input.prompt },
      });
      return { ok: true };
    }),

  resetPrompt: aiProcedure.mutation(async ({ ctx }) => {
    const userId = ctx.session!.user.id;
    await ctx.db.aiSetting.upsert({
      where: { userId },
      update: { prompt: DEFAULT_AI_PROMPT },
      create: { userId, prompt: DEFAULT_AI_PROMPT },
    });
    return { ok: true, prompt: DEFAULT_AI_PROMPT };
  }),

  saveProvider: aiProcedure
    .input(
      z.object({
        id: z.string().optional(),
        name: z.string().trim().min(1, "请填写提供商名称").max(60),
        baseUrl: baseUrlSchema,
        /** 留空表示沿用已保存的 Key（编辑场景） */
        apiKey: z.string().trim().max(3000).optional().default(""),
        model: z.string().trim().min(1, "请填写模型").max(120),
        enabled: z.boolean().optional().default(true),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session!.user.id;
      const existing = input.id
        ? await ctx.db.aiProvider.findFirst({
            where: { id: input.id, userId },
          })
        : null;

      if (input.id && !existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "提供商不存在" });
      }

      const apiKey = input.apiKey.trim() || existing?.apiKey?.trim() || "";
      if (!apiKey) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "请填写 API Key",
        });
      }

      if (existing) {
        await ctx.db.aiProvider.update({
          where: { id: existing.id },
          data: {
            name: input.name,
            baseUrl: input.baseUrl,
            apiKey,
            model: input.model,
            enabled: input.enabled,
          },
        });
        return { id: existing.id };
      }

      const created = await ctx.db.aiProvider.create({
        data: {
          userId,
          name: input.name,
          baseUrl: input.baseUrl,
          apiKey,
          model: input.model,
          enabled: input.enabled,
        },
      });
      return { id: created.id };
    }),

  setProviderEnabled: aiProcedure
    .input(z.object({ id: z.string(), enabled: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session!.user.id;
      const provider = await ctx.db.aiProvider.findFirst({
        where: { id: input.id, userId },
      });
      if (!provider) {
        throw new TRPCError({ code: "NOT_FOUND", message: "提供商不存在" });
      }
      await ctx.db.aiProvider.update({
        where: { id: provider.id },
        data: { enabled: input.enabled },
      });
      return { ok: true };
    }),

  deleteProvider: aiProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session!.user.id;
      const provider = await ctx.db.aiProvider.findFirst({
        where: { id: input.id, userId },
      });
      if (!provider) {
        throw new TRPCError({ code: "NOT_FOUND", message: "提供商不存在" });
      }
      await ctx.db.aiProvider.delete({ where: { id: provider.id } });
      return { ok: true };
    }),

  /** 调用历史：按「一次总结」分页，避免同一次总结的多个提供商尝试被拆到两页 */
  history: aiProcedure
    .input(
      z.object({
        page: z.number().int().min(1).optional().default(1),
        pageSize: z.number().int().min(1).max(50).optional().default(10),
      }),
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.session!.user.id;
      const page = input.page ?? 1;
      const pageSize = input.pageSize ?? 10;
      const where = { userId };

      const [runGroups, totalRows] = await Promise.all([
        ctx.db.aiCallLog.groupBy({
          by: ["runId"],
          where,
          _max: { createdAt: true },
          _count: { _all: true },
          orderBy: { _max: { createdAt: "desc" } },
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        ctx.db.$queryRaw<Array<{ total: number | bigint }>>`
          SELECT COUNT(DISTINCT "runId") AS "total"
          FROM "AiCallLog"
          WHERE "userId" = ${userId}
        `,
      ]);

      const total = Number(totalRows[0]?.total ?? 0);
      const runIds = runGroups.map((group) => group.runId);

      const items =
        runIds.length === 0
          ? []
          : await ctx.db.aiCallLog.findMany({
              where: { userId, runId: { in: runIds } },
              orderBy: [{ createdAt: "asc" }, { id: "asc" }],
              select: {
                id: true,
                runId: true,
                targetDay: true,
                trigger: true,
                providerName: true,
                model: true,
                status: true,
                error: true,
                content: true,
                inputChars: true,
                durationMs: true,
                createdAt: true,
              },
            });

      return {
        runs: runGroups.map((group) => ({
          runId: group.runId,
          createdAt: group._max.createdAt,
          attemptCount: group._count._all,
          items: items.filter((item) => item.runId === group.runId),
        })),
        total,
        page,
        pageSize,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
        hasMore: page * pageSize < total,
      };
    }),
});
