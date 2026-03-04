import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { compare, hash } from "bcryptjs";
import { protectedProcedure, router } from "@/server/api/trpc";

export const settingRouter = router({
  getMemosToken: protectedProcedure.query(({ ctx }) => {
    return ctx.db.user.findUnique({
      where: { id: ctx.session!.user.id },
      select: { memosToken: true },
    });
  }),
  updateMemosToken: protectedProcedure
    .input(z.object({ memosToken: z.string().min(1).nullable() }))
    .mutation(({ ctx, input }) => {
      return ctx.db.user.update({
        where: { id: ctx.session!.user.id },
        data: { memosToken: input.memosToken },
      });
    }),
  changePassword: protectedProcedure
    .input(
      z.object({
        currentPassword: z.string().min(1),
        newPassword: z.string().min(6),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const user = await ctx.db.user.findUnique({
        where: { id: ctx.session!.user.id },
      });

      if (!user) {
        throw new TRPCError({ code: "NOT_FOUND", message: "用户不存在" });
      }

      const isValid = await compare(input.currentPassword, user.password);
      if (!isValid) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "当前密码错误" });
      }

      const hashedPassword = await hash(input.newPassword, 10);

      return ctx.db.user.update({
        where: { id: ctx.session!.user.id },
        data: { password: hashedPassword },
      });
    }),
});
