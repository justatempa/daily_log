import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth";
import { db } from "@/server/db";
import { resolveStoredPath } from "@/server/image/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VARIANTS = ["thumb", "medium", "original"] as const;
type Variant = (typeof VARIANTS)[number];

function isVariant(value: string): value is Variant {
  return (VARIANTS as readonly string[]).includes(value);
}

/** 每个变体的响应类型与文件名后缀（图片内容不可变，可长缓存） */
const CONTENT_TYPE: Record<Variant, string | null> = {
  thumb: "image/webp",
  medium: "image/webp",
  // 原图按上传时的真实类型返回，用库里的 mime
  original: null,
};

/**
 * 读取图片文件：thumb（缩略图，列表用）/ medium（压缩图，预览默认用）/
 * original（原图，点「查看原图」时才加载）。
 * 严格按当前登录用户过滤，非本人图片一律 404。
 */
export async function GET(
  _request: Request,
  { params }: { params: { id: string; variant: string } },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return new NextResponse("请先登录", { status: 401 });
  }

  const variant = params.variant;
  if (!isVariant(variant)) {
    return new NextResponse("未知的图片规格", { status: 404 });
  }

  const image = await db.logImage.findFirst({
    where: { id: params.id, userId: session.user.id },
  });
  if (!image) {
    return new NextResponse("图片不存在", { status: 404 });
  }

  const relative =
    variant === "thumb"
      ? image.thumbPath
      : variant === "medium"
        ? image.mediumPath
        : image.originalPath;

  let filePath: string;
  try {
    filePath = resolveStoredPath(relative);
  } catch {
    return new NextResponse("图片不存在", { status: 404 });
  }

  const info = await stat(filePath).catch(() => null);
  if (!info?.isFile()) {
    return new NextResponse("图片文件已丢失", { status: 404 });
  }

  const contentType = CONTENT_TYPE[variant] ?? image.mime;
  const stream = Readable.toWeb(createReadStream(filePath)) as ReadableStream;

  return new Response(stream, {
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(info.size),
      // 同一张图的内容永不变化，且只对本人可见：允许浏览器长期缓存
      "Cache-Control": "private, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
