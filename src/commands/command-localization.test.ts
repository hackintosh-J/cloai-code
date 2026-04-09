import { expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import help from './help/index.js'
import config from './config/index.js'
import { context } from './context/index.js'

test('command descriptions are localized', () => {
  expect(help.description).toContain('帮助')
  expect(config.description).toContain('配置')
  expect(context.description).toContain('上下文')
})

test('interactive labels are localized in source', () => {
  const copyFile = readFileSync('src/commands/copy/copy.tsx', 'utf8')
  const themeFile = readFileSync('src/components/ThemePicker.tsx', 'utf8')
  expect(copyFile).toContain('完整回复')
  expect(themeFile).toContain('深色模式')
})

test('trust and teleport dialogs are localized in source', () => {
  const trustFile = readFileSync('src/components/TrustDialog/TrustDialog.tsx', 'utf8')
  const teleportFile = readFileSync('src/components/TeleportError.tsx', 'utf8')
  expect(trustFile).toContain('是，我信任此文件夹')
  expect(teleportFile).toContain('登录 Claude')
})

test('progress messages are localized', async () => {
  const { default: prComments } = await import('./pr_comments/index.js')
  expect(prComments.description).toContain('获取')
})
