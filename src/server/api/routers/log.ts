import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "@/server/api/trpc";

const dayRange = (date: Date) => {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
};

export const logRouter = router({
  getAll: protectedProcedure.query(({ ctx }) => {
    return ctx.db.log.findMany({
      where: { userId: ctx.session.user.id },
      orderBy: { createdAt: "asc" },
    });
  }),
  getByDate: protectedProcedure
    .input(z.object({ date: z.date() }))
    .query(async ({ ctx, input }) => {
      const { start, end } = dayRange(input.date);
      return ctx.db.log.findMany({
        where: {
          userId: ctx.session.user.id,
          parentId: null,
          date: { gte: start, lt: end },
        },
        orderBy: { createdAt: "asc" },
        include: {
          replies: { orderBy: { createdAt: "asc" } },
        },
      });
    }),
  getReplies: protectedProcedure
    .input(z.object({ logId: z.string() }))
    .query(({ ctx, input }) => {
      return ctx.db.log.findMany({
        where: {
          userId: ctx.session.user.id,
          parentId: input.logId,
        },
        orderBy: { createdAt: "asc" },
      });
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
        })
        .refine(
          (data) =>
            data.content.trim().length > 0 || data.tags.trim().length > 0,
          { message: "content or tags required" },
        ),
    )
    .mutation(({ ctx, input }) => {
      return ctx.db.log.create({
        data: {
          userId: ctx.session.user.id,
          content: input.content ?? "",
          date: input.date,
          tags: input.tags ?? "",
          isTodo: input.isTodo ?? false,
          isTodoDone: false,
          parentId: input.parentId ?? null,
        },
      });
    }),
  toggleTodo: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const log = await ctx.db.log.findFirst({
        where: { id: input.id, userId: ctx.session.user.id },
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
        where: { id: input.id, userId: ctx.session.user.id },
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
        where: { id: input.id, userId: ctx.session.user.id },
      });
      if (!log) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      await ctx.db.log.deleteMany({
        where: { parentId: input.id, userId: ctx.session.user.id },
      });
      await ctx.db.log.delete({ where: { id: input.id } });
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
          userId: ctx.session.user.id,
          content: item.content,
          date: item.date,
          tags: item.tags ?? "",
          isTodo: item.isTodo ?? false,
        })),
      });
      return { count: result.count };
    }),
});
