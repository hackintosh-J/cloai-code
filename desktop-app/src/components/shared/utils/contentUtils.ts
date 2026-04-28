/**
 * 内容处理相关工具函数
 */

/**
 * 检查消息是否为搜索状态消息
 */
export function isSearchStatusMessage(message: string): boolean {
  if (!message) return false;
  return (
    message.startsWith('正在搜索：') ||
    message.startsWith('正在读取网页：') ||
    message.startsWith('正在浏览 GitHub：') ||
    message.startsWith('Searching:') ||
    message.startsWith('Fetching:')
  );
}

/**
 * 从内容中提取文本（可能是纯字符串或JSON字符串化的内容数组）
 */
export function extractTextContent(content: any): string {
  if (!content) return '';
  if (typeof content !== 'string') return String(content);
  // 尝试解析为JSON数组（Anthropic API内容格式）
  if (content.startsWith('[')) {
    try {
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed)) {
        return parsed
          .filter((block: any) => block && block.type === 'text' && block.text)
          .map((block: any) => block.text)
          .join('\n');
      }
    } catch {
      // 不是有效的JSON，当作纯文本处理
    }
  }
  return content;
}
