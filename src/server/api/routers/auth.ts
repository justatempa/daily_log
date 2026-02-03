import { router, protectedProcedure } from "@/server/api/trpc";

export const authRouter = router({
  me: protectedProcedure.query(({ ctx }) => ctx.session!.user),
});
