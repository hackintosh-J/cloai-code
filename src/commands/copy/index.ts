/**
 * Copy command - minimal metadata only.
 * Implementation is lazy-loaded from copy.tsx to reduce startup time.
 */
import type { Command } from '../../commands.js'

const copy = {
  type: 'local-jsx',
  name: 'copy',
  description:
    '复制 Claude 的上一条回复到剪贴板（或使用 /copy N 复制倒数第 N 条）',
  load: () => import('./copy.js'),
} satisfies Command

export default copy
