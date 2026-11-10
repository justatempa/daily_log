import { TRPCError } from "@trpc/server";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { protectedProcedure, router } from "@/server/api/trpc";
import { deleteLogImageFiles } from "@/server/image/storage";
import { parseTagGroups } from "@/utils/tags";
import { countWords } from "@/utils/wordCount";
import { AI_SUMMARY_HASHTAG } from "@/utils/aiSummary";

/** 列表/搜索返回的日志结构：带评论和图片 */
type LogWithImagesAndReplies = Prisma.LogGetPayload<{
  include: { replies: true; images: true };
}>;

const MAX_IMAGES_PER_LOG = 9;

/** 从日志正文里截一段做图片说明（去掉换行，空内容用标签占位） */
function snippetOf(content: string | null | undefined, length = 48) {
  const text = (content ?? "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  return text.length > length ? `${text.slice(0, length)}…` : text;
}

/**
 * 把「上传后尚未归属」的图片挂到日志上，按传入顺序写 sortOrder。
 * 只接受本人名下、且未归属其它日志的图片；已被别处占用或已清理的 id 直接忽略，
 * 避免因一张图丢掉整条日志。
 */
async function attachImages(
  db: Prisma.TransactionClient,
  params: { userId: string; logId: string; imageIds?: string[] },
) {
  const ids = Array.from(new Set(params.imageIds ?? []))
    .filter(Boolean)
    .slice(0, MAX_IMAGES_PER_LOG);
  if (ids.length === 0) return;

  const images = await db.logImage.findMany({
    where: { id: { in: ids }, userId: params.userId },
    select: { id: true, logId: true },
  });
  const attachable = new Map(
    images
      .filter((image) => image.logId === null || image.logId === params.logId)
      .map((image) => [image.id, image.logId]),
  );

  const updates = ids
    .filter((id) => attachable.has(id))
    .map((id, index) =>
      db.logImage.update({
        where: { id },
        data: { logId: params.logId, sortOrder: index },
      }),
    );
  if (updates.length === 0) return;
  await Promise.all(updates);
}

export const logRouter = router({
  getAll: protectedProcedure.query(({ ctx }) => {
    return ctx.db.log.findMany({
      where: { userId: ctx.session!.user.id },
      orderBy: { createdAt: "asc" },
    });
  }),
  search: protectedProcedure
    .input(
      z.object({
        keyword: z.string().optional(),
        selectedTags: z
          .array(z.object({ category: z.string(), label: z.string() }))
          .optional(),
        startDate: z.date().optional(),
        endDate: z.date().optional(),
        /** all=全部（不过滤），done=已完成待办，undone=未完成待办 */
        todoStatus: z.enum(["all", "done", "undone"]).optional(),
        page: z.number().int().min(1).optional().default(1),
        pageSize: z.number().int().min(1).max(100).optional().default(20),
      }),
    )
    .query(async ({ ctx, input }) => {
      const page = input.page ?? 1;
      const pageSize = input.pageSize ?? 20;

      const where: {
        userId: string;
        parentId: null;
        content?: { contains: string };
        date?: { gte?: Date; lte?: Date };
        isTodo?: boolean;
        isTodoDone?: boolean;
      } = {
        userId: ctx.session!.user.id,
        parentId: null,
      };

      if (input.keyword && input.keyword.trim()) {
        where.content = { contains: input.keyword.trim() };
      }

      if (input.startDate || input.endDate) {
        where.date = {};
        if (input.startDate) {
          const start = new Date(input.startDate);
          start.setHours(0, 0, 0, 0);
          where.date.gte = start;
        }
        if (input.endDate) {
          const end = new Date(input.endDate);
          end.setHours(23, 59, 59, 999);
          where.date.lte = end;
        }
      }

      // Todo 状态：已完成/未完成都只命中待办条目，非待办在筛选时不展示
      if (input.todoStatus === "done") {
        where.isTodo = true;
        where.isTodoDone = true;
      } else if (input.todoStatus === "undone") {
        where.isTodo = true;
        where.isTodoDone = false;
      }

      const selected = input.selectedTags ?? [];

      if (selected.length > 0) {
        // 多选是或逻辑：包含任意一个选中快捷标签即匹配
        const candidates = await ctx.db.log.findMany({
          where,
          orderBy: [{ date: "desc" }, { createdAt: "desc" }],
          select: { id: true, tags: true },
        });

        const matchedIds = candidates
          .filter((log) => {
            const groups = parseTagGroups(log.tags);
            return selected.some((sel) => {
              const group = groups.find(
                (g) => g.category.trim() === sel.category.trim(),
              );
              return group ? group.labels.includes(sel.label.trim()) : false;
            });
          })
          .map((log) => log.id);

        const total = matchedIds.length;
        const totalPages = total === 0 ? 1 : Math.ceil(total / pageSize);
        const currentPage = Math.min(Math.max(1, page), totalPages);
        const pageIds = matchedIds.slice(
          (currentPage - 1) * pageSize,
          currentPage * pageSize,
        );

        let items: LogWithImagesAndReplies[] = [];

        if (pageIds.length > 0) {
          const fetchedItems = await ctx.db.log.findMany({
            where: { id: { in: pageIds } },
            include: {
              replies: { orderBy: { createdAt: "asc" } },
              images: { orderBy: { sortOrder: "asc" } },
            },
          });
          const itemMap = new Map(fetchedItems.map((item) => [item.id, item]));
          items = pageIds
            .map((id) => itemMap.get(id))
            .filter((item): item is NonNullable<typeof item> => Boolean(item));
        }

        return {
          items,
          total,
          page: currentPage,
          pageSize,
          totalPages,
        };
      }

      // 未选快捷标签时，由数据库原生分页
      const total = await ctx.db.log.count({ where });
      const totalPages = total === 0 ? 1 : Math.ceil(total / pageSize);
      const currentPage = Math.min(Math.max(1, page), totalPages);

      const items =
        total === 0
          ? []
          : await ctx.db.log.findMany({
              where,
              orderBy: [{ date: "desc" }, { createdAt: "desc" }],
              skip: (currentPage - 1) * pageSize,
              take: pageSize,
              include: {
                replies: { orderBy: { createdAt: "asc" } },
                images: { orderBy: { sortOrder: "asc" } },
              },
            });

      return {
        items,
        total,
        page: currentPage,
        pageSize,
        totalPages,
      };
    }),
  /**
   * 获取某天的日志。start/end 由客户端按「本地时区」给出
   * （start=当日 00:00，end=次日 00:00 的时间戳），服务端不做任何时区换算，
   * 直接按区间过滤，避免服务器时区与用户时区不一致导致日期错位。
   */
  getByDate: protectedProcedure
    .input(z.object({ start: z.date(), end: z.date() }))
    .query(async ({ ctx, input }) => {
      return ctx.db.log.findMany({
        where: {
          userId: ctx.session!.user.id,
          parentId: null,
          date: { gte: input.start, lt: input.end },
        },
        orderBy: { createdAt: "asc" },
        include: {
          replies: { orderBy: { createdAt: "asc" } },
          images: { orderBy: { sortOrder: "asc" } },
        },
      });
    }),
  /**
   * 相册：按「日志日期」倒序分页返回所有已归属日志的图片。
   * 同一天的多张图按该日志内的 sortOrder 排序；未归属日志的上传图（草稿/孤儿）不进相册。
   */
  listImages: protectedProcedure
    .input(
      z.object({
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(100).default(48),
      }),
    )
    .query(async ({ ctx, input }) => {
      const where: Prisma.LogImageWhereInput = {
        userId: ctx.session!.user.id,
        logId: { not: null },
      };
      const [total, rows] = await Promise.all([
        ctx.db.logImage.count({ where }),
        ctx.db.logImage.findMany({
          where,
          orderBy: [{ log: { date: "desc" } }, { sortOrder: "asc" }, { createdAt: "asc" }],
          skip: (input.page - 1) * input.pageSize,
          take: input.pageSize,
          select: {
            id: true,
            width: true,
            height: true,
            name: true,
            size: true,
            mediumSize: true,
            logId: true,
            log: { select: { id: true, date: true, content: true } },
          },
        }),
      ]);

      return {
        items: rows.map((row) => ({
          id: row.id,
          width: row.width,
          height: row.height,
          name: row.name,
          size: row.size,
          mediumSize: row.mediumSize,
          logId: row.log?.id ?? row.logId ?? "",
          logDate: row.log?.date ?? null,
          logTitle: snippetOf(row.log?.content),
        })),
        total,
        page: input.page,
        pageSize: input.pageSize,
        hasMore: input.page * input.pageSize < total,
      };
    }),
  /**
   * 返回某月内有主日志的所有日期时间戳，供日历标记小圆点。
   * year/month 为客户端本地时区的年月（month: 0-11）；服务端仅用 UTC 构造
   * 过滤区间并前后各放宽 1 天，具体「哪一天有日志」由客户端按本地时区判定，
   * 不依赖服务器时区。
   */
  getMonthDays: protectedProcedure
    .input(z.object({ year: z.number(), month: z.number() }))
    .query(async ({ ctx, input }) => {
      const start = new Date(Date.UTC(input.year, input.month, 1));
      const end = new Date(Date.UTC(input.year, input.month + 1, 1));
      // 放宽一天，覆盖客户端时区相对 UTC 的偏移（最多 ±14h），客户端会再按本地月份过滤
      const gte = new Date(start.getTime() - 24 * 60 * 60 * 1000);
      const lt = new Date(end.getTime() + 24 * 60 * 60 * 1000);
      const logs = await ctx.db.log.findMany({
        where: {
          userId: ctx.session!.user.id,
          parentId: null,
          date: { gte, lt },
        },
        select: { date: true },
      });
      return logs.map((log) => log.date);
    }),
  /**
   * 按天统计字数：返回 [start, end) 区间内每条日志/评论的 { date, count }，
   * 由客户端按本地时区归组到「日」。start/end 由客户端按本地时区给出
   * （start=区间首日 00:00，end=区间次日 00:00），服务端不做时区换算，
   * 与 getByDate 保持一致。
   *
   * 统计口径：带 #AI总结 标签的日志（AI 自动总结结果）整体不计入字数，
   * 避免 AI 生成的总结把当天字数虚高。
   */
  getStats: protectedProcedure
    .input(z.object({ start: z.date(), end: z.date() }))
    .query(async ({ ctx, input }) => {
      const logs = await ctx.db.log.findMany({
        where: {
          userId: ctx.session!.user.id,
          date: { gte: input.start, lt: input.end },
          NOT: { content: { contains: AI_SUMMARY_HASHTAG } },
        },
        select: { date: true, content: true },
      });
      return logs.map((log) => ({
        date: log.date,
        count: countWords(log.content),
      }));
    }),
  getReplies: protectedProcedure
    .input(z.object({ logId: z.string() }))
    .query(({ ctx, input }) => {
      return ctx.db.log.findMany({
        where: {
          userId: ctx.session!.user.id,
          parentId: input.logId,
        },
        orderBy: { createdAt: "asc" },
      });
    }),
  getHashtags: protectedProcedure.query(async ({ ctx }) => {
    // 只取顶级日志的 content，提取 hashtag 并统计
    const logs = await ctx.db.log.findMany({
      where: { userId: ctx.session!.user.id, parentId: null },
      select: { content: true },
    });

    const countMap = new Map<string, number>();
    const re = /(?:^|\s)#([\u4e00-\u9fa5\w]+)/g;
    for (const log of logs) {
      if (!log.content) continue;
      re.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = re.exec(log.content)) !== null) {
        const tag = match[1];
        countMap.set(tag, (countMap.get(tag) ?? 0) + 1);
      }
    }

    return Array.from(countMap.entries())
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count);
  }),
  add: protectedProcedure
    .input(
      z
        .object({
          content: z.string().optional().default(""),
          date: z.date(),
          tags: z.string().optional().default(""),
          isTodo: z.boolean().optional().default(false),
          parentId: z.string().nullable().optional(),
          /**
           * 客户端幂等键（clientId）：重发时复用同一个 clientId，
           * 服务端若已存在同 clientId 记录则直接返回，避免重复插入。
           */
          clientId: z.string().optional(),
          /** 已上传、尚未归属日志的图片 id（按展示顺序传入） */
          imageIds: z.array(z.string()).max(MAX_IMAGES_PER_LOG).optional(),
        })
        .refine(
          (data) =>
            data.content.trim().length > 0 ||
            data.tags.trim().length > 0 ||
            (data.imageIds?.length ?? 0) > 0,
          { message: "content, tags or images required" },
        ),
    )
    .mutation(async ({ ctx, input }) => {
      // 幂等：同一 clientId 已成功入库时直接返回已有记录（重发场景）
      if (input.clientId) {
        const existing = await ctx.db.log.findUnique({
          where: { clientId: input.clientId },
        });
        if (existing) {
          if (existing.userId !== ctx.session!.user.id) {
            throw new TRPCError({ code: "FORBIDDEN" });
          }
          // 上一次可能「日志已插入但响应丢失」：补挂本次带来的图片（已挂过的会被忽略）
          await attachImages(ctx.db, {
            userId: ctx.session!.user.id,
            logId: existing.id,
            imageIds: input.imageIds,
          });
          return existing;
        }
      }
      const created = await ctx.db.log.create({
        data: {
          userId: ctx.session!.user.id,
          content: input.content ?? "",
          date: input.date,
          tags: input.tags ?? "",
          isTodo: input.isTodo ?? false,
          isTodoDone: false,
          parentId: input.parentId ?? null,
          clientId: input.clientId ?? null,
        },
      });
      await attachImages(ctx.db, {
        userId: ctx.session!.user.id,
        logId: created.id,
        imageIds: input.imageIds,
      });
      return created;
    }),
  toggleTodo: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const log = await ctx.db.log.findFirst({
        where: { id: input.id, userId: ctx.session!.user.id },
      });
      if (!log) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      if (!log.isTodo) {
        throw new TRPCError({ code: "BAD_REQUEST" });
      }
      return ctx.db.log.update({
        where: { id: input.id },
        data: { isTodoDone: !log.isTodoDone },
      });
    }),
  update: protectedProcedure
    .input(
      z
        .object({
          id: z.string(),
          content: z.string().optional(),
          tags: z.string().optional(),
        })
        .refine((data) => data.content !== undefined || data.tags !== undefined, {
          message: "content or tags required",
        }),
    )
    .mutation(async ({ ctx, input }) => {
      const log = await ctx.db.log.findFirst({
        where: { id: input.id, userId: ctx.session!.user.id },
      });
      if (!log) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      return ctx.db.log.update({
        where: { id: input.id },
        data: {
          content: input.content ?? log.content,
          tags: input.tags ?? log.tags,
        },
      });
    }),
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const log = await ctx.db.log.findFirst({
        where: { id: input.id, userId: ctx.session!.user.id },
      });
      if (!log) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      const replyIds = (
        await ctx.db.log.findMany({
          where: { parentId: input.id, userId: ctx.session!.user.id },
          select: { id: true },
        })
      ).map((reply) => reply.id);
      const targetIds = [input.id, ...replyIds];

      // 先拿到图片记录，删完库再清磁盘，避免留下孤儿文件
      const images = await ctx.db.logImage.findMany({
        where: { logId: { in: targetIds } },
        select: { originalPath: true, mediumPath: true, thumbPath: true },
      });

      await ctx.db.log.deleteMany({
        where: { parentId: input.id, userId: ctx.session!.user.id },
      });
      await ctx.db.log.delete({ where: { id: input.id } });
      await ctx.db.logImage.deleteMany({
        where: { logId: { in: targetIds } },
      });
      await deleteLogImageFiles(images).catch((error) => {
        console.error("[log-delete] 图片文件清理失败", error);
      });
      return { id: input.id };
    }),
  import: protectedProcedure
    .input(
      z.object({
        items: z.array(
          z.object({
            content: z.string(),
            date: z.date(),
            tags: z.string().optional().default(""),
            isTodo: z.boolean().optional().default(false),
          }),
        ),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (input.items.length === 0) {
        return { count: 0 };
      }
      const result = await ctx.db.log.createMany({
        data: input.items.map((item) => ({
          userId: ctx.session!.user.id,
          content: item.content,
          date: item.date,
          tags: item.tags ?? "",
          isTodo: item.isTodo ?? false,
        })),
      });
      return { count: result.count };
    }),
});
