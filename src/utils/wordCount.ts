/**
 * 字数统计（统一口径，服务端与客户端共用）
 *
 * 统计规则：
 * - 只统计日志/评论正文 content；
 * - 去除所有空白字符（空格、换行、Tab 等）后，按 Unicode 码点计数：
 *   中文按「字」计，英文/数字按「字符」计，emoji 等代理对按 1 个计；
 * - 标签 tags、仅标签记录（content 为空）不计入字数。
 * - 带 #AI总结 标签的日志（AI 总结结果）整体不计入，见 utils/aiSummary 的
 *   isAiSummaryText；调用方需先过滤这类条目再调用 countWords。
 */
export function countWords(text: string): number {
  if (!text) return 0;
  return Array.from(text.replace(/\s/g, "")).length;
}
