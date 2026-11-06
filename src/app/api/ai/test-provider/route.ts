import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth";
import { testAiProvider } from "@/server/ai/summary";

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

  const rawId =
    body && typeof body === "object" && "providerId" in body
      ? (body as { providerId?: unknown }).providerId
      : undefined;
  const providerId = typeof rawId === "string" ? rawId.trim() : "";
  if (!providerId) {
    return NextResponse.json(
      { ok: false, error: "缺少 providerId" },
      { status: 400 },
    );
  }

  const result = await testAiProvider(session.user.id, providerId);
  return NextResponse.json(result);
}
