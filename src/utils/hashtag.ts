/**
 * 从正文里提取行内 hashtag（#xxx）
 * 和 QuickTag 两级标签系统完全分离，只是正文里的蓝色高亮标记
 */

// 匹配 #xxx：从行首或空白字符后开始，# 后面跟中文/英文/数字/下划线
const HASHTAG_RE = /(^|[\s　])#([\u4e00-\u9fa5\w]+)/g;

export type TextSegment = {
  text: string;
  isHashtag: boolean;
};

/**
 * 把正文拆成普通片段和 hashtag 片段
 * "今天 #工作 完成了" ->
 *   [{text:"今天 ",isHashtag:false},{text:"#工作",isHashtag:true},{text:" 完成了",isHashtag:false}]
 */
export function parseRichText(content: string): TextSegment[] {
  const segments: TextSegment[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  HASHTAG_RE.lastIndex = 0;
  while ((match = HASHTAG_RE.exec(content)) !== null) {
    // match[1] 是前面的空白，match[2] 是 hashtag 文字（不含 #）
    const prefix = match[1] || "";
    const hashtagText = "#" + match[2];
    const start = match.index;
    const end = start + match[0].length;

    // hashtag 前面的普通文本（包含空白）
    const before = content.slice(lastIndex, start + prefix.length);
    if (before) {
      segments.push({ text: before, isHashtag: false });
    }
    segments.push({ text: hashtagText, isHashtag: true });

    lastIndex = end;
  }

  // 剩余尾部
  if (lastIndex < content.length) {
    segments.push({ text: content.slice(lastIndex), isHashtag: false });
  }

  return segments;
}
