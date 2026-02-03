import { z } from "zod";
import { protectedProcedure, router } from "@/server/api/trpc";

export const quickTagRouter = router({
  getGrouped: protectedProcedure.query(async ({ ctx }) => {
    const tags = await ctx.db.quickTag.findMany({
      where: { userId: ctx.session!.user.id },
      orderBy: [{ categoryName: "asc" }, { label: "asc" }],
    });
    const grouped: Record<string, string[]> = {};
    for (const tag of tags) {
      if (!grouped[tag.categoryName]) {
        grouped[tag.categoryName] = [];
      }
      grouped[tag.categoryName].push(tag.label);
    }
    return grouped;
  }),
  add: protectedProcedure
    .input(
      z.object({
        label: z.string().min(1),
        categoryName: z.string().min(1),
      }),
    )
    .mutation(({ ctx, input }) => {
      return ctx.db.quickTag.create({
        data: {
          userId: ctx.session!.user.id,
          label: input.label,
          categoryName: input.categoryName,
        },
      });
    }),
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
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ ctx, input }) => {
      return ctx.db.quickTag.delete({ where: { id: input.id } });
    }),
});
