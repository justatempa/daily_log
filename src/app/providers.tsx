"use client";

import { SessionProvider } from "next-auth/react";
import { TRPCReactProvider } from "@/utils/api";

export default function Providers({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SessionProvider>
      <TRPCReactProvider>{children}</TRPCReactProvider>
    </SessionProvider>
  );
}
