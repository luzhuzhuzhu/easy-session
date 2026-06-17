// es peek 输出清洗：会话历史以原始 PTY chunk 存储（一个 OutputLine.text 是整块数据，
// 含多行 / ANSI 转义 / 回车覆盖 / 空白行），按 chunk 数取既不精准也夹带控制码与空白行。
// tailVisibleLines 把原始流清洗成「最后 N 行可读文本」：去 ANSI 与控制码、按回车取
// 覆盖后内容、按换行切行、过滤纯空白行、取末尾 N 行。

// 全部用 fromCharCode + 转义字符串构造正则，避免源码出现字面控制字节（也规避 lint 的
// no-control-regex / no-irregular-whitespace）。ESC = 0x1b。
const ESC = String.fromCharCode(27)
// CSI（颜色/光标/清屏）、OSC（标题等，BEL 结尾）、单字符 ESC 序列。正则确实要求 ESC 前缀。
const ANSI = new RegExp(
  `${ESC}\\[[0-9;?]*[ -/]*[@-~]` + // CSI
    `|${ESC}\\][^\\u0007]*\\u0007` + // OSC ... BEL
    `|${ESC}[@-Z\\\\-_]`, // 单字符 ESC 序列
  'g'
)
// 其余控制字符（保留制表符 0x09；换行 0x0a 已先行切分）。
const CTRL = new RegExp('[\\u0000-\\u0008\\u000b\\u000c\\u000e-\\u001f\\u007f]', 'g')

export function tailVisibleLines(raw: string, maxLines: number): string {
  const limit = Number.isFinite(maxLines) ? Math.max(1, Math.floor(maxLines)) : 40
  const out: string[] = []
  for (const physical of raw.split('\n')) {
    // 回车覆盖：同一物理行被回车重写（如 spinner）时，仅取最后一段近似可见态。
    const seg = physical.includes('\r') ? physical.slice(physical.lastIndexOf('\r') + 1) : physical
    const clean = seg.replace(ANSI, '').replace(CTRL, '').replace(/[ \t]+$/, '')
    if (clean.trim().length === 0) continue // 过滤纯空白行
    out.push(clean)
  }
  return out.slice(-limit).join('\n')
}
