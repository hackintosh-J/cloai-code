/**
 * Chat utility functions
 * Extracted from MainContent.tsx for better maintainability
 */

/**
 * Format chat error messages with user-friendly Chinese text
 */
export function formatChatError(err: string): string {
  const lower = (err || '').toLowerCase();
  if (lower.includes('quota_exceeded') || lower.includes('额度已用完') || lower.includes('额度已用尽') || lower.includes('时段额度') || lower.includes('周期额度')) {
    return '⚠️ 当前额度已用完，请等待额度重置后再试。你可以在设置页查看额度详情。';
  }
  if (lower.includes('订阅已过期') || lower.includes('未激活') || lower.includes('inactive') || lower.includes('expired')) {
    return '⚠️ 你的订阅已过期或未激活，请续费后继续使用。';
  }
  if (lower.includes('invalid api key') || lower.includes('authentication')) {
    return '⚠️ API 认证失败，请重新登录。';
  }
  if (lower.includes('overloaded') || lower.includes('rate limit') || lower.includes('529')) {
    return '⚠️ 服务暂时繁忙，请稍后再试。';
  }
  return 'Error: ' + err;
}

/**
 * Format voice recognition error messages
 */
export function formatVoiceError(err?: string): string {
  switch (err) {
    case 'not-allowed':
    case 'service-not-allowed':
      return '请先允许 Claude 使用麦克风，然后再试一次。';
    case 'audio-capture':
      return '没有检测到可用的麦克风。';
    case 'network':
      return '语音识别暂时不可用，请稍后重试。';
    case 'no-speech':
      return '没有听到语音输入。';
    case 'aborted':
      return '';
    default:
      return '当前环境暂时无法启动语音听写。';
  }
}

/**
 * Format message timestamp for display
 * Returns time for today, date for this year, full date for other years
 */
export function formatMessageTime(dateStr: string): string {
  if (!dateStr) return '';

  let timeStr = dateStr;
  // Handle SQLite format (space instead of T)
  if (timeStr.includes(' ') && !timeStr.includes('T')) {
    timeStr = timeStr.replace(' ', 'T');
  }
  // Handle missing timezone (assume UTC if no Z or offset at end)
  if (!/Z$|[+-]\d{2}:?\d{2}$/.test(timeStr)) {
    timeStr += 'Z';
  }

  const date = new Date(timeStr);
  if (isNaN(date.getTime())) return '';

  const now = new Date();
  const isToday = date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  if (isToday) {
    return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
  }
  const isSameYear = date.getFullYear() === now.getFullYear();
  if (isSameYear) {
    return `${date.getMonth() + 1}月${date.getDate()}日`;
  }
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
}

/**
 * Add authentication token to URL if needed
 */
export function withAuthToken(url: string): string {
  if (!url || url.startsWith('data:') || /[?&]token=/.test(url)) return url;
  if (typeof window === 'undefined') return url;
  const token = localStorage.getItem('auth_token');
  if (!token) return url;
  return `${url}${url.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}`;
}
