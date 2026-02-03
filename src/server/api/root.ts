import { router } from "@/server/api/trpc";
import { authRouter } from "@/server/api/routers/auth";
import { logRouter } from "@/server/api/routers/log";
import { quickTagRouter } from "@/server/api/routers/quickTag";
import { settingRouter } from "@/server/api/routers/setting";
import { userRouter } from "@/server/api/routers/user";

export const appRouter = router({
  auth: authRouter,
  user: userRouter,
  log: logRouter,
  quickTag: quickTagRouter,
  setting: settingRouter,
});

export type AppRouter = typeof appRouter;
