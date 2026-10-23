import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "@/server/api/trpc";

export const quickTagRouter = router({
  /**
   * 当前用户全部快捷标签（扁平列表，含 id / 排序 / 隐藏状态）。
   * 展示顺序 = sortOrder 升序；未手动排序过的标签按创建时间先后排列。
   * 主页面只展示 hidden=false 的标签，管理弹窗展示全部。
   */
  list: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.quickTag.findMany({
      where: { userId: ctx.session!.user.id },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        categoryName: true,
        label: true,
        sortOrder: true,
        hidden: true,
      },
    });
  }),
  add: protectedProcedure
    .input(
      z.object({
        label: z.string().min(1),
        categoryName: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // 追加到当前顺序末尾（sortOrder 为全局最大值 +1）
      const last = await ctx.db.quickTag.aggregate({
        where: { userId: ctx.session!.user.id },
        _max: { sortOrder: true },
      });
      return ctx.db.quickTag.create({
        data: {
          userId: ctx.session!.user.id,
          label: input.label,
          categoryName: input.categoryName,
          sortOrder: (last._max.sortOrder ?? -1) + 1,
        },
      });
    }),
  /** 重命名分类：该分类下所有标签一起改名 */
  updateCategory: protectedProcedure
    .input(z.object({ oldName: z.string(), newName: z.string() }))
    .mutation(({ ctx, input }) => {
      return ctx.db.quickTag.updateMany({
        where: {
          userId: ctx.session!.user.id,
          categoryName: input.oldName,
        },
        data: { categoryName: input.newName },
      });
    }),
  /** 重命名单个标签 */
  updateLabel: protectedProcedure
    .input(z.object({ id: z.string(), label: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.quickTag.findFirst({
        where: { id: input.id, userId: ctx.session!.user.id },
      });
      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      return ctx.db.quickTag.update({
        where: { id: input.id },
        data: { label: input.label.trim() },
      });
    }),
  /** 设置单个标签是否在主页面隐藏 */
  setHidden: protectedProcedure
    .input(z.object({ id: z.string(), hidden: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.quickTag.findFirst({
        where: { id: input.id, userId: ctx.session!.user.id },
      });
      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      return ctx.db.quickTag.update({
        where: { id: input.id },
        data: { hidden: input.hidden },
      });
    }),
  /**
   * 批量设置展示顺序：ids 为完整的展示顺序（分类内连排、分类块整体移动），
   * 服务端按数组下标写入 sortOrder。需要包含当前用户全部标签。
   */
  reorder: protectedProcedure
    .input(z.object({ ids: z.array(z.string()) }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session!.user.id;
      if (new Set(input.ids).size !== input.ids.length) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "ids 不能重复" });
      }
      const owned = await ctx.db.quickTag.findMany({
        where: { userId },
        select: { id: true },
      });
      const ownedIds = new Set(owned.map((tag) => tag.id));
      for (const id of input.ids) {
        if (!ownedIds.has(id)) {
          throw new TRPCError({ code: "NOT_FOUND" });
        }
      }
      await ctx.db.$transaction(
        input.ids.map((id, index) =>
          ctx.db.quickTag.update({
            where: { id },
            data: { sortOrder: index },
          }),
        ),
      );
      return { count: input.ids.length };
    }),
  /** 删除单个标签 */
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.quickTag.findFirst({
        where: { id: input.id, userId: ctx.session!.user.id },
      });
      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      return ctx.db.quickTag.delete({ where: { id: input.id } });
    }),
  /** 删除整个分类（该分类下所有标签） */
  deleteCategory: protectedProcedure
    .input(z.object({ categoryName: z.string() }))
    .mutation(({ ctx, input }) => {
      return ctx.db.quickTag.deleteMany({
        where: {
          userId: ctx.session!.user.id,
          categoryName: input.categoryName,
        },
      });
    }),
});
