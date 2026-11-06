/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: "standalone",
  // 启用 src/instrumentation.ts：启动时补 AI 表结构并启动每日总结调度器
  experimental: {
    instrumentationHook: true,
  },
};

export default nextConfig;
