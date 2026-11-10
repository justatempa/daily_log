import { db } from "@/server/db";

/**
 * 生产环境是「镜像 + 宿主机挂载的 SQLite 文件」，部署流水线里没有 prisma migrate。
 * 为了让新增的 AI 表/字段在容器重启后自动可用，启动时执行一次幂等的补丁：
 * - CREATE TABLE IF NOT EXISTS（AI 三张表 + 日志图片表 LogImage）
 * - PRAGMA 检查后给 Log 补 source 列
 *
 * 已存在的库上不会改动任何已有数据。
 */

let readyPromise: Promise<void> | null = null;

async function runPatches(): Promise<void> {
  await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "AiProvider" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "userId" TEXT NOT NULL,
      "name" TEXT NOT NULL,
      "baseUrl" TEXT NOT NULL,
      "apiKey" TEXT NOT NULL,
      "model" TEXT NOT NULL,
      "enabled" BOOLEAN NOT NULL DEFAULT true,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL,
      CONSTRAINT "AiProvider_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    )
  `);
  await db.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "AiProvider_userId_idx" ON "AiProvider"("userId")`,
  );

  await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "AiSetting" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "userId" TEXT NOT NULL,
      "prompt" TEXT NOT NULL,
      "autoEnabled" BOOLEAN NOT NULL DEFAULT true,
      "timezone" TEXT NOT NULL DEFAULT 'Asia/Shanghai',
      "scheduleHour" INTEGER NOT NULL DEFAULT 0,
      "scheduleMinute" INTEGER NOT NULL DEFAULT 30,
      "lastAutoRunDay" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL,
      CONSTRAINT "AiSetting_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    )
  `);
  await db.$executeRawUnsafe(
    `CREATE UNIQUE INDEX IF NOT EXISTS "AiSetting_userId_key" ON "AiSetting"("userId")`,
  );

  await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "AiCallLog" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "userId" TEXT NOT NULL,
      "runId" TEXT NOT NULL,
      "targetDate" DATETIME,
      "targetDay" TEXT,
      "trigger" TEXT NOT NULL,
      "providerId" TEXT,
      "providerName" TEXT NOT NULL,
      "model" TEXT NOT NULL,
      "status" TEXT NOT NULL,
      "error" TEXT,
      "content" TEXT,
      "inputChars" INTEGER NOT NULL DEFAULT 0,
      "durationMs" INTEGER NOT NULL DEFAULT 0,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "AiCallLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    )
  `);
  await db.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "AiCallLog_userId_createdAt_idx" ON "AiCallLog"("userId", "createdAt")`,
  );

  // 日志图片（原图 / 压缩图 / 缩略图 三份文件在磁盘上，这里只存相对路径）
  await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "LogImage" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "userId" TEXT NOT NULL,
      "logId" TEXT,
      "name" TEXT NOT NULL,
      "mime" TEXT NOT NULL,
      "size" INTEGER NOT NULL,
      "mediumSize" INTEGER NOT NULL,
      "width" INTEGER NOT NULL,
      "height" INTEGER NOT NULL,
      "originalPath" TEXT NOT NULL,
      "mediumPath" TEXT NOT NULL,
      "thumbPath" TEXT NOT NULL,
      "sortOrder" INTEGER NOT NULL DEFAULT 0,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "LogImage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "LogImage_logId_fkey" FOREIGN KEY ("logId") REFERENCES "Log" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    )
  `);
  await db.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "LogImage_userId_idx" ON "LogImage"("userId")`,
  );
  await db.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "LogImage_logId_idx" ON "LogImage"("logId")`,
  );
  await db.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "LogImage_logId_sortOrder_idx" ON "LogImage"("logId", "sortOrder")`,
  );

  const columns = await db.$queryRawUnsafe<Array<{ name?: string }>>(
    'PRAGMA table_info("Log")',
  );
  if (
    Array.isArray(columns) &&
    columns.length > 0 &&
    !columns.some((column) => column.name === "source")
  ) {
    await db.$executeRawUnsafe('ALTER TABLE "Log" ADD COLUMN "source" TEXT');
  }
}

export function ensureAiSchema(): Promise<void> {
  if (!readyPromise) {
    readyPromise = runPatches().catch((error) => {
      // 失败后允许下次请求重试，避免一次数据库抖动导致永久不可用
      readyPromise = null;
      throw error;
    });
  }
  return readyPromise;
}
