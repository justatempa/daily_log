import { randomUUID } from "node:crypto";
import { mkdir, readdir, rmdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp, { type Metadata } from "sharp";
import { db } from "@/server/db";

/**
 * 日志图片的本地存储。
 *
 * 设计取舍：
 * - 数据量不大，直接放本地文件夹（默认 <项目根>/uploads，可用 UPLOAD_DIR 覆盖），
 *   不引入对象存储；磁盘上每张图保留三份，避免每次看图都下载原图。
 * - 原图按上传的字节原样保存（不转码），「查看原图」拿到的是真正的原始文件；
 *   压缩图 / 缩略图统一转 webp，顺带修掉 EXIF 方向（手机竖拍不会横躺）。
 * - 压缩与缩略都由服务端 sharp 负责，客户端只负责选中文件上传，结果一致且可复用。
 */

/** 单张原图上限：20MB（手机原图通常 2–8MB，留足余量） */
export const IMAGE_MAX_BYTES = 20 * 1024 * 1024;
/** 一条日志最多附带 9 张图（九宫格） */
export const IMAGE_MAX_PER_LOG = 9;
/** 压缩图长边上限 */
export const IMAGE_MEDIUM_MAX_EDGE = 1600;
/** 缩略图长边上限 */
export const IMAGE_THUMB_MAX_EDGE = 480;
/** 支持的输入格式（sharp 识别到的真实格式，不信任扩展名/MIME） */
const SUPPORTED_FORMATS = new Set(["jpeg", "png", "webp", "gif", "avif"]);
/** 未附加到日志的图片保留时长，超时后由清理任务回收 */
const ORPHAN_TTL_MS = 24 * 60 * 60 * 1000;
/** 进程内清理节流：最多每小时跑一次 */
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;

export type ImageErrorCode =
  | "TOO_LARGE"
  | "UNSUPPORTED_FORMAT"
  | "PROCESS_FAILED";

export class ImageError extends Error {
  code: ImageErrorCode;

  constructor(code: ImageErrorCode, message: string) {
    super(message);
    this.name = "ImageError";
    this.code = code;
  }
}

/** 上传根目录（绝对路径） */
export function uploadRoot(): string {
  return path.resolve(process.env.UPLOAD_DIR ?? "uploads");
}

/** 图片目录（绝对路径） */
export function imagesRoot(): string {
  return path.join(uploadRoot(), "images");
}

/**
 * 把库里存的相对路径（images/2026/11/xxx-thumb.webp）还原成绝对路径。
 * 强制校验不能跳出上传根目录，避免任何形式的路径穿越。
 */
export function resolveStoredPath(relativePath: string): string {
  const root = uploadRoot();
  const full = path.resolve(root, relativePath);
  if (full !== root && !full.startsWith(root + path.sep)) {
    throw new Error(`非法的图片路径：${relativePath}`);
  }
  return full;
}

function formatExtension(format: string): string {
  return format === "jpeg" ? "jpg" : format;
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

async function removeFilesQuietly(paths: string[]): Promise<void> {
  await Promise.all(
    paths.map((file) => unlink(file).catch(() => undefined)),
  );
  // 顺手清掉因删除而变空的日期目录（最多两级，失败忽略）
  for (const file of paths) {
    const folder = path.dirname(file);
    try {
      if ((await readdir(folder)).length === 0) {
        await rmdir(folder);
        const parent = path.dirname(folder);
        if ((await readdir(parent)).length === 0) {
          await rmdir(parent);
        }
      }
    } catch {
      // 目录非空 / 不存在都无需处理
    }
  }
}

/** 删除一张图对应的三个文件（库记录由调用方删除） */
export async function deleteLogImageFiles(images: Array<{
  originalPath: string;
  mediumPath: string;
  thumbPath: string;
}>): Promise<void> {
  const files: string[] = [];
  for (const image of images) {
    for (const stored of [image.originalPath, image.mediumPath, image.thumbPath]) {
      if (!stored) continue;
      try {
        files.push(resolveStoredPath(stored));
      } catch {
        // 路径异常就跳过，不影响其它文件
      }
    }
  }
  if (files.length > 0) {
    await removeFilesQuietly(files);
  }
}

export type SaveLogImageInput = {
  userId: string;
  buffer: Buffer;
  /** 客户端提供的原始文件名，仅用于展示 */
  filename?: string;
};

/**
 * 保存一张图片：写原图 + 压缩图 + 缩略图，返回已入库的记录（此时还没有 logId）。
 * 失败时会清理已写入的文件，不留下半套数据。
 */
export async function saveLogImage(input: SaveLogImageInput) {
  const { userId, buffer } = input;
  if (buffer.byteLength === 0) {
    throw new ImageError("PROCESS_FAILED", "图片内容为空");
  }
  if (buffer.byteLength > IMAGE_MAX_BYTES) {
    throw new ImageError(
      "TOO_LARGE",
      `单张图片不能超过 ${Math.round(IMAGE_MAX_BYTES / 1024 / 1024)}MB`,
    );
  }

  let meta: Metadata;
  try {
    meta = await sharp(buffer).metadata();
  } catch {
    throw new ImageError("UNSUPPORTED_FORMAT", "无法读取这张图片，请换一张试试");
  }
  const format = meta.format ?? "";
  if (!SUPPORTED_FORMATS.has(format)) {
    throw new ImageError(
      "UNSUPPORTED_FORMAT",
      "只支持 JPG / PNG / WebP / GIF / AVIF 格式的图片",
    );
  }
  if (!meta.width || !meta.height) {
    throw new ImageError("PROCESS_FAILED", "这张图片没有有效的尺寸信息");
  }

  // EXIF 方向 5–8 表示画面被旋转 90°，宽高与显示方向互换
  const orientation = meta.orientation ?? 1;
  const swapped = orientation >= 5;
  const displayWidth = swapped ? meta.height : meta.width;
  const displayHeight = swapped ? meta.width : meta.height;
  const pixels = meta.width * meta.height;
  if (pixels > 100_000_000) {
    throw new ImageError("TOO_LARGE", "图片分辨率过大，请先缩小后再上传");
  }

  const now = new Date();
  const yyyy = String(now.getFullYear());
  const mm = pad2(now.getMonth() + 1);
  const folderRelative = `images/${yyyy}/${mm}`;
  const folderAbsolute = path.join(imagesRoot(), yyyy, mm);
  const base = `${yyyy}${mm}${pad2(now.getDate())}-${randomUUID()}`;
  const ext = formatExtension(format);

  const originalRelative = `${folderRelative}/${base}-orig.${ext}`;
  const mediumRelative = `${folderRelative}/${base}-md.webp`;
  const thumbRelative = `${folderRelative}/${base}-thumb.webp`;

  let mediumBuffer: Buffer;
  let thumbBuffer: Buffer;
  try {
    await mkdir(folderAbsolute, { recursive: true });
    mediumBuffer = await sharp(buffer, { failOn: "none" })
      .rotate()
      .resize({
        width: IMAGE_MEDIUM_MAX_EDGE,
        height: IMAGE_MEDIUM_MAX_EDGE,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 80, effort: 4 })
      .toBuffer();
    thumbBuffer = await sharp(buffer, { failOn: "none" })
      .rotate()
      .resize({
        width: IMAGE_THUMB_MAX_EDGE,
        height: IMAGE_THUMB_MAX_EDGE,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 72, effort: 4 })
      .toBuffer();
  } catch {
    throw new ImageError("PROCESS_FAILED", "图片处理失败，请换一张试试");
  }

  const writtenFiles: string[] = [];
  const name = sanitizeName(input.filename) ?? `image.${ext}`;
  // mime 以真实格式为准（客户端上报的 type 可能为空或不准）
  const mime = mimeForFormat(format);

  try {
    const originalAbsolute = resolveStoredPath(originalRelative);
    const mediumAbsolute = resolveStoredPath(mediumRelative);
    const thumbAbsolute = resolveStoredPath(thumbRelative);

    await writeFile(originalAbsolute, buffer);
    writtenFiles.push(originalAbsolute);
    await writeFile(mediumAbsolute, mediumBuffer);
    writtenFiles.push(mediumAbsolute);
    await writeFile(thumbAbsolute, thumbBuffer);
    writtenFiles.push(thumbAbsolute);

    const image = await db.logImage.create({
      data: {
        userId,
        name,
        mime,
        size: buffer.byteLength,
        mediumSize: mediumBuffer.byteLength,
        width: displayWidth,
        height: displayHeight,
        originalPath: originalRelative,
        mediumPath: mediumRelative,
        thumbPath: thumbRelative,
      },
    });
    return image;
  } catch (error) {
    await removeFilesQuietly(writtenFiles);
    throw error;
  }
}

function sanitizeName(filename?: string): string | null {
  if (!filename) return null;
  // 只取文件名部分，去掉路径分隔符与控制字符，限制长度
  const base = filename.split(/[\\/]/).pop() ?? "";
  const cleaned = base.replace(/[\u0000-\u001f<>:"|?*]/g, "").trim();
  return cleaned ? cleaned.slice(0, 120) : null;
}

function mimeForFormat(format: string): string {
  switch (format) {
    case "png":
      return "image/png";
    case "webp":
      return "image/webp";
    case "gif":
      return "image/gif";
    case "avif":
      return "image/avif";
    default:
      return "image/jpeg";
  }
}

let lastCleanupAt = 0;

/**
 * 回收「上传成功但从未附加到日志」的图片（例如用户在输入框里选了图又放弃发送）。
 * 只在写图时顺带触发，每小时最多一次，避免额外定时任务。
 */
export async function cleanupOrphanImages(): Promise<void> {
  const now = Date.now();
  if (now - lastCleanupAt < CLEANUP_INTERVAL_MS) return;
  lastCleanupAt = now;

  const stale = await db.logImage.findMany({
    where: { logId: null, createdAt: { lt: new Date(now - ORPHAN_TTL_MS) } },
    select: { id: true, originalPath: true, mediumPath: true, thumbPath: true },
  });
  if (stale.length === 0) return;

  await db.logImage.deleteMany({ where: { id: { in: stale.map((i) => i.id) } } });
  await deleteLogImageFiles(stale);
}
