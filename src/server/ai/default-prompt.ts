/**
 * AI 总结默认提示词
 *
 * 占位符：
 * - {{date}}：被总结的日期（含星期），例如 2026-11-05（周三）
 * - {{logs}}：格式化后的当日日志文本
 */
export const DEFAULT_AI_PROMPT = `你是一位温和、克制的私人日记助理。下面是一天（{{date}}）的日志记录，请据此写一份中文总结。

要求：
1. 只依据给出的日志内容，不编造、不推测未提到的事实；信息不足时如实说明。
2. 输出 200–400 字，纯文本，分 3–4 段短句，可用「·」开头；不使用 Markdown 标题、表格或代码块。当天内容较少时可以更短，不要为凑字数重复或空泛扩写。
3. 概括当天的主要事项与进展、情绪与状态变化，以及值得记住的细节。
4. 日志中标记为未完成的待办（[ ]）单独列出提醒；已完成的待办不必逐条罗列。
5. 语气平实，像写给本人看的回顾，不要空泛鼓励和套话。
6. 最后用一句话给出明天可执行的小建议；若日志中有明确的待办或目标，围绕它给建议。

【当日日志】
{{logs}}`;

const LOGS_HEADER = "【当日日志】";

/** 把提示词模板与变量拼成最终发给模型的内容。模板缺少占位符时自动补齐。 */
export function buildPrompt(
  template: string,
  variables: { date: string; logs: string },
): string {
  const base = template.trim() ? template : DEFAULT_AI_PROMPT;
  let result = base
    .replace(/{{date}}/g, variables.date)
    .replace(/{{logs}}/g, variables.logs);

  if (!base.includes("{{logs}}")) {
    result = `${result}\n\n${LOGS_HEADER}\n${variables.logs}`;
  }
  if (!base.includes("{{date}}")) {
    result = `日期：${variables.date}\n\n${result}`;
  }
  return result;
}
