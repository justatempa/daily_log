/**
 * AI 总结日志的标识（服务端与客户端共用）
 *
 * AI 总结结果会作为一条日志写入被总结当天 23:59，正文末尾追加 #AI总结。
 * 这个 hashtag 同时也是「排除 AI 总结」的唯一依据：AI 总结本身、字数统计
 * 等需要忽略 AI 总结的场景都调用这里，避免各处重复写死字符串。
 */
export const AI_SUMMARY_HASHTAG = "#AI总结";

/** 判断一条日志/评论正文是否为 AI 总结（带了 #AI总结 标签） */
export function isAiSummaryText(content?: string | null): boolean {
  return typeof content === "string" && content.includes(AI_SUMMARY_HASHTAG);
}
