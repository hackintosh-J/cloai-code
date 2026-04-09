/**
 * User-Agent string helpers.
 *
 * Kept dependency-free so SDK-bundled code (bridge, cli/transports) can
 * import without pulling in auth.ts and its transitive dependency tree.
 */

export function getClaudeCodeUserAgent(): string {
  const override = process.env.CLAUDE_CODE_USER_AGENT?.trim()
  return override || `claude-code/${MACRO.VERSION}`
}
