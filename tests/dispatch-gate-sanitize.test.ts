// SEC-1：协作注入文本安全过滤测试
import { describe, expect, it } from 'vitest'
import { sanitizeInjectText } from '../src/main/services/agent-bus/dispatch-gate'

describe('sanitizeInjectText', () => {
  it('removes embedded ESC bytes so bracketed-paste cannot be escaped', () => {
    // 恶意样本：内嵌 \x1b[201~ 提前结束 paste 模式，剩余内容会被逐键注入
    const malicious = 'hello \x1b[201~calc.exe & whoami'
    const out = sanitizeInjectText(malicious)
    expect(out).not.toContain('\x1b')
    expect(out).not.toContain('\x1b[201~')
    expect(out).toContain('hello ')
  })

  it('strips CSI/OSC and other escape-sequence initiators', () => {
    expect(sanitizeInjectText('a\x1b[2Jb')).toBe('a[2Jb')
    expect(sanitizeInjectText('a\x1b]0;titleb')).toBe('a]0;titleb')
    expect(sanitizeInjectText('a\x1bP+q b')).toBe('aP+q b')
    expect(sanitizeInjectText('a\x9b0mb')).toBe('a0mb')
  })

  it('removes C0 control characters but keeps newline and tab', () => {
    expect(sanitizeInjectText('a\x00\x07b')).toBe('ab')
    expect(sanitizeInjectText('line1\nline2\tcol')).toBe('line1\nline2\tcol')
  })

  it('keeps plain multiline message intact for bracketed paste', () => {
    const msg = 'please review:\n1. fix bug\n2. add tests'
    expect(sanitizeInjectText(msg)).toBe(msg)
  })

  it('keeps CJK and common punctuation intact', () => {
    const msg = '请检查任务 #12：修改 src/foo.ts，注意类型。'
    expect(sanitizeInjectText(msg)).toBe(msg)
  })

  it('truncates oversized text to the inject limit', () => {
    const big = 'x'.repeat(64 * 1024 + 10)
    expect(sanitizeInjectText(big).length).toBe(64 * 1024)
  })

  it('renders a paste-escape attack inert end to end', () => {
    // 完整攻击链模拟：攻击者想让目标终端在 paste 外执行 `rm -rf /`
    const attack = 'task update \x1b[201~\nrm -rf /\n\x1b[200~'
    const out = sanitizeInjectText(attack)
    // 不含 ESC → 无法终止/开启 paste 模式；剩余仅为普通文本与换行
    expect(out.includes('\x1b')).toBe(false)
    expect(out).toContain('rm -rf /') // 仍作为可见文本存在，但只是输入内容而非逃逸序列
  })
})
