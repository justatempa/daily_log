import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth";
import {
  ImageError,
  IMAGE_MAX_BYTES,
  IMAGE_MAX_PER_LOG,
  cleanupOrphanImages,
  saveLogImage,
} from "@/server/image/storage";

/** sharp 需要 Node runtime；上传是动态请求，不做静态优化 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 一次请求最多带 9 张图，额外给表单开销留 2MB 余量 */
const MAX_REQUEST_BYTES = IMAGE_MAX_BYTES * IMAGE_MAX_PER_LOG + 2 * 1024 * 1024;

function fail(message: string, status: number) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

/**
 * 上传图片：立即处理成「原图 + 压缩图 + 缩略图」三份落盘，返回图片 id。
 * 此时图片还没有归属日志（logId 为空），由 log.add 的 imageIds 字段关联。
 */
export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return fail("请先登录", 401);
  }

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) {
    return fail("图片太大，请压缩后再上传", 413);
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return fail("上传数据解析失败，请重试", 400);
  }

  const entries = [
    ...form.getAll("files"),
    ...(form.get("file") ? [form.get("file")] : []),
  ].filter((item): item is File => item instanceof File);

  if (entries.length === 0) {
    return fail("没有收到图片文件", 400);
  }
  if (entries.length > IMAGE_MAX_PER_LOG) {
    return fail(`一次最多上传 ${IMAGE_MAX_PER_LOG} 张图片`, 400);
  }

  const saved: Array<{
    id: string;
    name: string;
    width: number;
    height: number;
    size: number;
    mediumSize: number;
    mime: string;
  }> = [];

  try {
    for (const file of entries) {
      if (file.size === 0) {
        return fail(`「${file.name}」是空文件`, 400);
      }
      if (file.size > IMAGE_MAX_BYTES) {
        return fail(
          `「${file.name}」超过 ${Math.round(IMAGE_MAX_BYTES / 1024 / 1024)}MB，请先压缩`,
          413,
        );
      }
      const image = await saveLogImage({
        userId: session.user.id,
        buffer: Buffer.from(await file.arrayBuffer()),
        filename: file.name,
      });
      saved.push({
        id: image.id,
        name: image.name,
        width: image.width,
        height: image.height,
        size: image.size,
        mediumSize: image.mediumSize,
        mime: image.mime,
      });
    }
  } catch (error) {
    if (error instanceof ImageError) {
      return NextResponse.json(
        { ok: false, code: error.code, error: error.message },
        { status: error.code === "TOO_LARGE" ? 413 : 400 },
      );
    }
    console.error("[image-upload] failed", error);
    return fail("图片保存失败，请稍后重试", 500);
  }

  // 顺手回收「选了图但一直没发日志」的孤儿图片（内部有每小时一次的节流）
  void cleanupOrphanImages().catch((error) => {
    console.error("[image-upload] orphan cleanup failed", error);
  });

  return NextResponse.json({ ok: true, images: saved });
}
