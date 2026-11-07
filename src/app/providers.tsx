"use client";

import { SessionProvider } from "next-auth/react";
import { TRPCReactProvider } from "@/utils/api";
import { ConfirmHost } from "@/components/ui/confirm";

export default function Providers({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SessionProvider>
      <TRPCReactProvider>
        {children}
        {/* 全站统一确认框宿主，放在最后保证盖在业务弹窗之上 */}
        <ConfirmHost />
      </TRPCReactProvider>
    </SessionProvider>
  );
}
