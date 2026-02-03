import { z } from "zod";
import { protectedProcedure, router } from "@/server/api/trpc";

export const settingRouter = router({
  getMemosToken: protectedProcedure.query(({ ctx }) => {
    return ctx.db.user.findUnique({
      where: { id: ctx.session.user.id },
      select: { memosToken: true },
    });
  }),
  updateMemosToken: protectedProcedure
    .input(z.object({ memosToken: z.string().min(1).nullable() }))
    .mutation(({ ctx, input }) => {
      return ctx.db.user.update({
        where: { id: ctx.session.user.id },
        data: { memosToken: input.memosToken },
      });
    }),
});
