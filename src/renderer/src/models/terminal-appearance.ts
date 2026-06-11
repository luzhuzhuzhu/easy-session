// 终端外观（字体/字重）：全局设置 + 会话级覆盖（存于 session options.appearance）。
// 纯渲染层概念，主进程只负责原样持久化 options。

// 由细到粗；100-300 仅在字体自带对应字重（如可变字体）时有视觉差异
export const TERMINAL_FONT_WEIGHTS = ['100', '200', '300', 'normal', '500', '600', 'bold'] as const

export type TerminalFontWeight = (typeof TERMINAL_FONT_WEIGHTS)[number]

export function isTerminalFontWeight(value: unknown): value is TerminalFontWeight {
  return typeof value === 'string' && (TERMINAL_FONT_WEIGHTS as readonly string[]).includes(value)
}

// 终端行高倍数：xterm 要求 >= 1，过大没有实用价值
export const DEFAULT_TERMINAL_LINE_HEIGHT = 1
export const MIN_TERMINAL_LINE_HEIGHT = 1
export const MAX_TERMINAL_LINE_HEIGHT = 2

export function clampTerminalLineHeight(value: unknown): number {
  const num = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(num)) return DEFAULT_TERMINAL_LINE_HEIGHT
  return Math.min(MAX_TERMINAL_LINE_HEIGHT, Math.max(MIN_TERMINAL_LINE_HEIGHT, Math.round(num * 100) / 100))
}

// 终端字符间距（px，可为负值微调收紧）
export const DEFAULT_TERMINAL_LETTER_SPACING = 0
export const MIN_TERMINAL_LETTER_SPACING = -2
export const MAX_TERMINAL_LETTER_SPACING = 10

export function clampTerminalLetterSpacing(value: unknown): number {
  const num = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(num)) return DEFAULT_TERMINAL_LETTER_SPACING
  return Math.min(
    MAX_TERMINAL_LETTER_SPACING,
    Math.max(MIN_TERMINAL_LETTER_SPACING, Math.round(num * 100) / 100)
  )
}

export const DEFAULT_TERMINAL_FONT_FAMILY = 'Consolas, "Courier New", monospace'

// 常用等宽字体候选（datalist 建议，仍可手输任意 font-family 栈）。
// 中文显示发虚/发丑通常是因为纯西文等宽字体缺少 CJK 字形，
// 推荐带 CJK 的等宽字体或显式声明中文回退。
export const TERMINAL_FONT_SUGGESTIONS = [
  'Cascadia Code',
  'Cascadia Mono',
  'JetBrains Mono',
  'Fira Code',
  'Sarasa Mono SC',
  'Maple Mono NF CN',
  'Noto Sans Mono CJK SC',
  'Source Code Pro',
  'Consolas',
  '"Cascadia Mono", "Microsoft YaHei", monospace'
]

// 效果预览文本：固定中英混排（不随界面语言切换），覆盖 CJK、西文、数字与常见符号
export const TERMINAL_FONT_PREVIEW_LINES = [
  '终端字体效果预览：中文混排示例（粗细、对齐、字形）',
  'The quick brown fox jumps over the lazy dog 0123456789 -> != === {} []'
]

// 粗体预览行：单独应用 fontWeightBold（对应 ANSI 加粗文本的渲染字重）
export const TERMINAL_FONT_PREVIEW_BOLD_LINE = '粗体渲染示例 Bold sample 0123456789 中文加粗'

// 取 font-family 栈的首选字体名（去引号）
export function primaryFontFamily(stack: string): string {
  const first = stack.split(',')[0] ?? ''
  return first.trim().replace(/^["']|["']$/g, '').trim()
}

// canvas 实测字体是否已安装：候选字体与通用回退字体渲染同一段文本，
// 宽度有差异即认为已安装。比 document.fonts.check 在系统字体上更可靠。
const FONT_PROBE_TEXT = 'mmmmwwwwiiii0101中文字重示例'
let fontProbeCtx: CanvasRenderingContext2D | null | undefined

export function isFontInstalled(family: string): boolean {
  const name = primaryFontFamily(family)
  if (!name) return false

  try {
    if (fontProbeCtx === undefined) {
      fontProbeCtx = document.createElement('canvas').getContext('2d')
    }
    const ctx = fontProbeCtx
    if (!ctx) return true // 无法探测时不拦截用户输入

    for (const generic of ['monospace', 'serif'] as const) {
      ctx.font = `16px ${generic}`
      const baseline = ctx.measureText(FONT_PROBE_TEXT).width
      ctx.font = `16px "${name}", ${generic}`
      if (ctx.measureText(FONT_PROBE_TEXT).width !== baseline) return true
    }
    return false
  } catch {
    return true
  }
}

let installedSuggestionsCache: string[] | null = null

// 候选列表只保留本机已安装的字体（带逗号的组合栈始终保留，回退已内置）
export function getInstalledFontSuggestions(): string[] {
  if (!installedSuggestionsCache) {
    installedSuggestionsCache = TERMINAL_FONT_SUGGESTIONS.filter(
      (suggestion) => suggestion.includes(',') || isFontInstalled(suggestion)
    )
  }
  return installedSuggestionsCache
}

// 判断字体是否等宽：窄字符串与宽字符串渲染宽度一致
function isMonospaceFamily(family: string): boolean {
  try {
    if (fontProbeCtx === undefined) {
      fontProbeCtx = document.createElement('canvas').getContext('2d')
    }
    const ctx = fontProbeCtx
    if (!ctx) return false
    ctx.font = `16px "${family.replace(/"/g, '')}"`
    const narrow = ctx.measureText('iiiiiiiiil').width
    const wide = ctx.measureText('MMMMMMMMMW').width
    return narrow > 0 && Math.abs(narrow - wide) < 0.5
  } catch {
    return false
  }
}

// CJK 字形探测：宽度比对不可行（全角汉字在所有字体里步进都是 1em），
// 改用位图比对——字体自带字形时，换不同回退字体渲染结果也完全相同
let bitmapProbeCtx: CanvasRenderingContext2D | null | undefined
const cjkSupportCache = new Map<string, boolean>()

function getBitmapProbeCtx(): CanvasRenderingContext2D | null {
  if (bitmapProbeCtx === undefined) {
    const canvas = document.createElement('canvas')
    canvas.width = 96
    canvas.height = 28
    bitmapProbeCtx = canvas.getContext('2d', { willReadFrequently: true })
  }
  return bitmapProbeCtx
}

function cjkBitmap(ctx: CanvasRenderingContext2D, stack: string): Uint8ClampedArray {
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height)
  ctx.font = `20px ${stack}`
  ctx.textBaseline = 'top'
  ctx.fillText('中文字形', 0, 2)
  return ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height).data
}

function bitmapsEqual(a: Uint8ClampedArray, b: Uint8ClampedArray): boolean {
  for (let i = 3; i < a.length; i += 4) {
    if (a[i] !== b[i]) return false
  }
  return true
}

function fontSupportsCjk(family: string): boolean {
  const name = primaryFontFamily(family)
  if (!name) return false
  const cached = cjkSupportCache.get(name)
  if (cached !== undefined) return cached

  let result = false
  try {
    const ctx = getBitmapProbeCtx()
    if (ctx) {
      result = bitmapsEqual(cjkBitmap(ctx, `"${name}", serif`), cjkBitmap(ctx, `"${name}", monospace`))
    }
  } catch {
    result = false
  }
  cjkSupportCache.set(name, result)
  return result
}

interface LocalFontMeta {
  family: string
}

type QueryLocalFontsFn = () => Promise<LocalFontMeta[]>

export interface SystemFontGroups {
  // 等宽且自带 CJK 字形：终端中文显示的最佳选择
  cjkMono: string[]
  // 等宽（无 CJK 字形，中文走系统回退）
  mono: string[]
  // 非等宽：可选但会影响终端网格排版（与 Windows Terminal 同样的取舍）
  other: string[]
}

export function fallbackFontGroups(): SystemFontGroups {
  return { cjkMono: [], mono: getInstalledFontSuggestions(), other: [] }
}

let systemFontGroupsCache: SystemFontGroups | null = null
let systemFontsQueryInFlight: Promise<SystemFontGroups> | null = null

// 枚举系统已安装字体（Chromium queryLocalFonts）并分组：
// 等宽+CJK / 等宽 / 非等宽。API 不可用或被拒时回退到静态候选探测。
export async function listSystemFontGroups(): Promise<SystemFontGroups> {
  if (systemFontGroupsCache) return systemFontGroupsCache
  if (systemFontsQueryInFlight) return systemFontsQueryInFlight

  systemFontsQueryInFlight = (async () => {
    const query = (window as { queryLocalFonts?: QueryLocalFontsFn }).queryLocalFonts
    if (typeof query !== 'function') return fallbackFontGroups()

    try {
      const fonts = await query.call(window)
      const families = Array.from(new Set(fonts.map((font) => font.family)))
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b))
      if (families.length === 0) return fallbackFontGroups()

      const groups: SystemFontGroups = { cjkMono: [], mono: [], other: [] }
      for (const family of families) {
        if (isMonospaceFamily(family)) {
          if (fontSupportsCjk(family)) {
            groups.cjkMono.push(family)
          } else {
            groups.mono.push(family)
          }
        } else {
          groups.other.push(family)
        }
      }
      // 非等宽组内：含 CJK 字形的排前面（选非等宽通常就是为了中文）
      groups.other.sort((a, b) => Number(fontSupportsCjk(b)) - Number(fontSupportsCjk(a)))

      systemFontGroupsCache = groups
      return groups
    } catch {
      // 失败不缓存，下次（带用户手势的）调用可重试
      return fallbackFontGroups()
    } finally {
      systemFontsQueryInFlight = null
    }
  })()

  return systemFontsQueryInFlight
}

// font-family 栈转 canvas font 简写可用形式：含空格且未加引号的字体名必须补引号，
// 否则整条 font 赋值会被静默忽略
const GENERIC_FAMILIES = new Set(['monospace', 'serif', 'sans-serif', 'system-ui', 'cursive', 'fantasy'])

function toCanvasFontStack(stack: string): string {
  return stack
    .split(',')
    .map((part) => {
      const name = part.trim()
      if (!name) return ''
      if (GENERIC_FAMILIES.has(name.toLowerCase())) return name
      if (/^["'].*["']$/.test(name)) return name
      return `"${name}"`
    })
    .filter(Boolean)
    .join(', ')
}

const distinctWeightsCache = new Map<string, TerminalFontWeight[]>()

// 实测当前字体能区分出几档字重：各档渲染同一段文本后逐像素比对，
// 渲染结果相同的档位视为同一档（静态字体通常只有常规/粗体两档有效）
export function detectDistinctFontWeights(stack: string): TerminalFontWeight[] {
  const key = stack.trim() || DEFAULT_TERMINAL_FONT_FAMILY
  const cached = distinctWeightsCache.get(key)
  if (cached) return cached

  const fallback = [...TERMINAL_FONT_WEIGHTS]
  try {
    const canvas = document.createElement('canvas')
    canvas.width = 160
    canvas.height = 36
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return fallback

    const fontStack = toCanvasFontStack(ensureMonospaceFallback(key))
    const sampleText = 'Aa字重Mw01'
    const bitmaps: Array<{ weight: TerminalFontWeight; data: Uint8ClampedArray }> = []
    const distinct: TerminalFontWeight[] = []

    for (const weight of TERMINAL_FONT_WEIGHTS) {
      const cssWeight = weight === 'normal' ? '400' : weight === 'bold' ? '700' : weight
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.font = `${cssWeight} 24px ${fontStack}`
      ctx.textBaseline = 'top'
      ctx.fillText(sampleText, 0, 4)
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data

      const duplicate = bitmaps.some((entry) => {
        if (entry.data.length !== data.length) return false
        for (let i = 3; i < data.length; i += 4) {
          if (entry.data[i] !== data[i]) return false
        }
        return true
      })
      if (!duplicate) {
        bitmaps.push({ weight, data: data.slice() })
        distinct.push(weight)
      }
    }

    const result = distinct.length > 0 ? distinct : fallback
    distinctWeightsCache.set(key, result)
    return result
  } catch {
    return fallback
  }
}

// 规范化字体栈并补默认等宽回退。统一补引号是关键：xterm 会把该值原样拼进
// 样式表，以数字开头或含特殊符号的字体名（如 "3270 Nerd Font"）不加引号会让
// 整条 font-family 声明失效，表现为"某些字体选了没反应"
export function ensureMonospaceFallback(stack: string): string {
  const trimmed = stack.trim()
  if (!trimmed) return DEFAULT_TERMINAL_FONT_FAMILY
  const normalized = toCanvasFontStack(trimmed)
  if (!normalized) return DEFAULT_TERMINAL_FONT_FAMILY
  if (normalized.toLowerCase().includes('monospace')) return normalized
  return `${normalized}, ${DEFAULT_TERMINAL_FONT_FAMILY}`
}

export interface SessionAppearanceOptions {
  fontFamily?: string
  fontWeight?: string
  fontWeightBold?: string
  lineHeight?: number
  letterSpacing?: number
}

// 从 session options 安全读取 appearance（字段可能不存在或被外部写坏）
export function parseSessionAppearance(options: unknown): SessionAppearanceOptions {
  if (!options || typeof options !== 'object') return {}
  const appearance = (options as Record<string, unknown>).appearance
  if (!appearance || typeof appearance !== 'object' || Array.isArray(appearance)) return {}

  const raw = appearance as Record<string, unknown>
  const result: SessionAppearanceOptions = {}
  if (typeof raw.fontFamily === 'string' && raw.fontFamily.trim()) {
    result.fontFamily = raw.fontFamily.trim()
  }
  if (isTerminalFontWeight(raw.fontWeight)) {
    result.fontWeight = raw.fontWeight
  }
  if (isTerminalFontWeight(raw.fontWeightBold)) {
    result.fontWeightBold = raw.fontWeightBold
  }
  if (typeof raw.lineHeight === 'number' && Number.isFinite(raw.lineHeight)) {
    result.lineHeight = clampTerminalLineHeight(raw.lineHeight)
  }
  if (typeof raw.letterSpacing === 'number' && Number.isFinite(raw.letterSpacing)) {
    result.letterSpacing = clampTerminalLetterSpacing(raw.letterSpacing)
  }
  return result
}
