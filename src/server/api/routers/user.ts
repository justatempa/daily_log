import { z } from "zod";
import { adminProcedure, protectedProcedure, router } from "@/server/api/trpc";
import { hash } from "bcryptjs";
import { generateApiToken } from "@/server/openapi/token";

export const userRouter = router({
  list: adminProcedure.query(({ ctx }) => {
    return ctx.db.user.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
      },
    });
  }),
  create: adminProcedure
    .input(
      z.object({
        name: z.string().min(1),
        email: z.string().email(),
        password: z.string().min(6),
        role: z.enum(["ADMIN", "USER"]).default("USER"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const passwordHash = await hash(input.password, 10);
      return ctx.db.user.create({
        data: {
          name: input.name,
          email: input.email.toLowerCase(),
          password: passwordHash,
          role: input.role,
        },
      });
    }),
  updateStatus: adminProcedure
    .input(z.object({ id: z.string(), isActive: z.boolean() }))
    .mutation(({ ctx, input }) => {
      return ctx.db.user.update({
        where: { id: input.id },
        data: { isActive: input.isActive },
      });
    }),
  updateSecretKey: protectedProcedure
    .input(z.object({ secretKey: z.string().min(1) }))
    .mutation(({ ctx, input }) => {
      return ctx.db.user.update({
        where: { id: ctx.session!.user.id },
        data: { secretKey: input.secretKey },
      });
    }),
  getApiToken: protectedProcedure.query(async ({ ctx }) => {
    const user = await ctx.db.user.findUnique({
      where: { id: ctx.session!.user.id },
      select: { secretKey: true },
    });
    return { apiToken: user?.secretKey ?? null };
  }),
  generateApiToken: protectedProcedure.mutation(async ({ ctx }) => {
    const token = generateApiToken();
    await ctx.db.user.update({
      where: { id: ctx.session!.user.id },
      data: { secretKey: token },
    });
    return { apiToken: token };
  }),
  revokeApiToken: protectedProcedure.mutation(async ({ ctx }) => {
    await ctx.db.user.update({
      where: { id: ctx.session!.user.id },
      data: { secretKey: null },
    });
    return { apiToken: null };
  }),
});
