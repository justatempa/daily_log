/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: "standalone",
  // 启用 src/instrumentation.ts：启动时补 AI 表结构并启动每日总结调度器
  experimental: {
    instrumentationHook: true,
    // standalone 产物需要显式带上 sharp 的原生二进制（@img/* 是运行时按平台加载的，
    // 静态追踪容易漏掉，漏了会在容器里报 "Could not load the sharp module"）
    outputFileTracingIncludes: {
      "/api/images/**": [
        "./node_modules/sharp/**/*",
        "./node_modules/@img/**/*",
      ],
    },
  },
};

export default nextConfig;
