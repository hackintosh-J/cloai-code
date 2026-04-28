import { FileReadTool } from './FileReadTool.js'

describe('FileReadTool input normalization', () => {
  test.each(['', '   '])('treats blank pages value as omitted: %s', pages => {
    const parsed = FileReadTool.inputSchema.safeParse({
      file_path: '/tmp/example.txt',
      pages,
    })

    expect(parsed.success).toBe(true)
    if (parsed.success) {
      expect(parsed.data.pages).toBeUndefined()
    }
  })

  test('preserves non-blank pages value', () => {
    const parsed = FileReadTool.inputSchema.safeParse({
      file_path: '/tmp/example.pdf',
      pages: '1-5',
    })

    expect(parsed.success).toBe(true)
    if (parsed.success) {
      expect(parsed.data.pages).toBe('1-5')
    }
  })
})
