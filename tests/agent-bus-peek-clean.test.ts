import { describe, expect, it } from 'vitest'
import { tailVisibleLines } from '../src/main/services/agent-bus/peek-clean'

// 用 fromCharCode 构造 ESC，避免测试源码里出现字面控制字节。
const ESC = String.fromCharCode(27)

describe('tailVisibleLines（es peek 输出清洗）', () => {
  it('按可视行返回最后 N 行（不是 chunk 数）', () => {
    const raw = Array.from({ length: 100 }, (_, i) => `line${i}`).join('\n')
    expect(tailVisibleLines(raw, 5).split('\n')).toEqual(['line95', 'line96', 'line97', 'line98', 'line99'])
  })

  it('过滤纯空白行（空行 / 仅空格 / 仅制表符）', () => {
    expect(tailVisibleLines('a\n\n  \nb\n\t\nc', 10)).toBe('a\nb\nc')
  })

  it('剥离 ANSI 颜色/光标/清屏序列', () => {
    const input = `${ESC}[31mred${ESC}[0m\n${ESC}[2K${ESC}[1Gclean`
    expect(tailVisibleLines(input, 10)).toBe('red\nclean')
  })

  it('不会误删普通方括号文本（无 ESC 前缀时不剥离）', () => {
    expect(tailVisibleLines('arr[0] = x', 10)).toBe('arr[0] = x')
  })

  it('回车覆盖只保留最后一段（spinner 帧）', () => {
    expect(tailVisibleLines('⠋ thinking\r⠙ thinking\r⠹ done', 10)).toBe('⠹ done')
  })

  it('N 超过可用行时返回全部（已去空白）', () => {
    expect(tailVisibleLines('x\n\ny', 100)).toBe('x\ny')
  })

  it('maxLines 非法 / <=0 时回退到至少 1 行', () => {
    expect(tailVisibleLines('a\nb\nc', 0)).toBe('c')
    expect(tailVisibleLines('a\nb\nc', -5)).toBe('c')
    expect(tailVisibleLines('a\nb\nc', NaN).split('\n').length).toBe(3)
  })
})
