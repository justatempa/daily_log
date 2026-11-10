/** 图片规格：缩略图（列表）/ 压缩图（预览）/ 原图（点「查看原图」才加载） */
export type ImageVariant = "thumb" | "medium" | "original";

/** 一条日志最多带的图片数（九宫格） */
export const MAX_IMAGES_PER_LOG = 9;
/** 单张原图上限，与服务端保持一致，选图时先挡一道 */
export const IMAGE_MAX_BYTES = 20 * 1024 * 1024;
/** 文件选择框的 accept（服务端还会按真实格式再校验一次） */
export const IMAGE_ACCEPT = "image/jpeg,image/png,image/webp,image/gif,image/avif";

/** 图片访问地址：统一走鉴权接口，按变体区分大小 */
export function imageUrl(id: string, variant: ImageVariant = "thumb"): string {
  return `/api/images/${encodeURIComponent(id)}/${variant}`;
}

/** 前端展示用的图片信息（列表/时间轴只需要这些） */
export type LogImageInfo = {
  id: string;
  width: number;
  height: number;
  name?: string;
  /** 原图字节数 */
  size?: number;
  /** 压缩图字节数 */
  mediumSize?: number;
};

/** 相册里的一张图：额外带上它所属日志的信息，便于跳回那天/那条 */
export type GalleryImage = LogImageInfo & {
  logId: string;
  logDate: Date | null;
  /** 所属日志正文的摘要，仅有标签时为空 */
  logTitle: string;
};

export function formatBytes(bytes?: number): string {
  if (!bytes || bytes <= 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
