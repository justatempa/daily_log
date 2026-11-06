import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth";
import { AiSummaryError, summarizeDay } from "@/server/ai/summary";
import { isValidDayString } from "@/utils/datetime";

/** AI 调用可能持续一段时间，使用 Node runtime，且不受默认 15s 前端超时影响 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json(
      { ok: false, error: "请先登录" },
      { status: 401 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "请求体不是合法 JSON" },
      { status: 400 },
    );
  }

  const rawDay =
    body && typeof body === "object" && "day" in body
      ? (body as { day?: unknown }).day
      : undefined;
  const day = typeof rawDay === "string" ? rawDay.trim() : "";
  if (!isValidDayString(day)) {
    return NextResponse.json(
      { ok: false, error: "请提供有效的日期（YYYY-MM-DD）" },
      { status: 400 },
    );
  }

  try {
    const result = await summarizeDay({
      userId: session.user.id,
      day,
      trigger: "MANUAL",
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof AiSummaryError) {
      return NextResponse.json(
        {
          ok: false,
          code: error.code,
          error: error.message,
          attempts: error.attempts,
        },
        { status: error.code === "ALL_FAILED" ? 502 : 400 },
      );
    }
    console.error("[ai-summary] manual summary error", error);
    return NextResponse.json(
      {
        ok: false,
        error: `生成失败：${
          error instanceof Error ? error.message : String(error)
        }`,
      },
      { status: 500 },
    );
  }
}
