import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth";
import { db } from "@/server/db";
import { deleteLogImageFiles } from "@/server/image/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 删除一张「还没归属到日志」的图片（输入框里选错了图直接移除）。
 * 已经挂到日志上的图片走日志删除，避免出现日志还在、图没了的空壳记录。
 */
export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, error: "请先登录" }, { status: 401 });
  }

  const image = await db.logImage.findFirst({
    where: { id: params.id, userId: session.user.id },
  });
  if (!image) {
    return NextResponse.json(
      { ok: false, error: "图片不存在" },
      { status: 404 },
    );
  }
  if (image.logId) {
    return NextResponse.json(
      { ok: false, error: "该图片已属于某条日志，请删除日志" },
      { status: 409 },
    );
  }

  await db.logImage.delete({ where: { id: image.id } });
  await deleteLogImageFiles([image]);
  return NextResponse.json({ ok: true });
}
