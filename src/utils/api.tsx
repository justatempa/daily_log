"use client";

import { createTRPCReact } from "@trpc/react-query";
import type { AppRouter } from "@/server/api/root";
import { httpBatchLink, loggerLink } from "@trpc/client";
import superjson from "superjson";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

export const api = createTRPCReact<AppRouter>();

/** 请求超时时间（毫秒）。默认 15s，可通过 NEXT_PUBLIC_API_TIMEOUT_MS 环境变量覆盖 */
const _rawTimeout = Number(process.env.NEXT_PUBLIC_API_TIMEOUT_MS);
const API_TIMEOUT_MS =
  Number.isFinite(_rawTimeout) && _rawTimeout > 0 ? _rawTimeout : 15000;

/**
 * 带超时的 fetch：超时后通过 AbortController 中断请求，
 * 使挂起的请求尽快失败（前端显示"发送失败/重发"而不再无限转圈）。
 */
const fetchWithTimeout: typeof fetch = (input, init) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
  const signal = init?.signal;
  const onAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) {
      controller.abort();
    } else {
      signal.addEventListener("abort", onAbort, { once: true });
    }
  }
  const request = fetch(input, { ...init, signal: controller.signal });
  const cleanup = () => {
    clearTimeout(timer);
    if (signal) {
      signal.removeEventListener("abort", onAbort);
    }
  };
  request.then(cleanup, cleanup);
  return request;
};

export function TRPCReactProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [queryClient] = useState(() => new QueryClient());
  const [trpcClient] = useState(() =>
    api.createClient({
      transformer: superjson,
      links: [
        loggerLink({
          enabled: (opts) =>
            process.env.NODE_ENV === "development" ||
            (opts.direction === "down" && opts.result instanceof Error),
        }),
        httpBatchLink({
          url: "/api/trpc",
          fetch: fetchWithTimeout,
        }),
      ],
    }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <api.Provider client={trpcClient} queryClient={queryClient}>
        {children}
      </api.Provider>
    </QueryClientProvider>
  );
}
