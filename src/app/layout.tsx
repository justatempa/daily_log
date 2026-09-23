import "./globals.css";
import type { Metadata, Viewport } from "next";
import { Space_Grotesk } from "next/font/google";
import Providers from "./providers";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space-grotesk",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://log.911250.xyz"),
  title: "Daily Log",
  description: "Daily Log · 日志时间线 —— 记录日常、待办与标签。",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "Daily Log",
    description: "Daily Log · 日志时间线 —— 记录日常、待办与标签。",
    siteName: "Daily Log",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#4F46E5",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body className={spaceGrotesk.variable}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}