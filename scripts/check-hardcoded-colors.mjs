#!/usr/bin/env node
// FEAT-9 验收工具：扫描桌面端 SCSS/Vue 样式块中的硬编码色值。
// 目标：所有颜色经 design tokens（--xx 变量 / color-mix 引用变量）表达。
// 允许例外：SVG path 内的 fill/stroke=currentColor、纯黑白的特殊场景白名单。
// 用法：node scripts/check-hardcoded-colors.mjs（exit 1 = 发现违规）

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, extname } from 'node:path'

const ROOTS = ['src/renderer/src']
const EXTS = new Set(['.vue', '.scss'])
// 已评审的例外（历史遗留清单，逐个消化后从这里删除）
const WHITELIST = [
  'src/renderer/src/assets',
  'src/renderer/src/components/TerminalOutput.vue'
]

const COLOR_HEX = /#[0-9a-fA-F]{3,8}\b/g
const COLOR_RGB = /\brgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+/g

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    const st = statSync(full)
    if (st.isDirectory()) yield* walk(full)
    else if (EXTS.has(extname(name))) yield full
  }
}

function isWhitelisted(file) {
  return WHITELIST.some((prefix) => file.replaceAll('\\', '/').startsWith(prefix))
}

// 提取 <style> 块；非样式区域的 hex（如 SVG 图标）不算违规
function styleSegments(content) {
  const segments = []
  const re = /<style[^>]*>([\s\S]*?)<\/style>/g
  let match
  while ((match = re.exec(content))) segments.push(match[1])
  return segments.length ? segments : [content]
}

const violations = []
let checked = 0

for (const root of ROOTS) {
  for (const file of walk(root)) {
    if (isWhitelisted(file)) continue
    const content = readFileSync(file, 'utf8')
    checked += 1
    for (const segment of styleSegments(content)) {
      const lines = segment.split('\n')
      const IGNORE = 'check-hardcoded-colors-ignore'
      lines.forEach((line, index) => {
        // 同行 ignore 标记，或上一行是 ignore 标记，或整行是注释：跳过
        if (line.includes(IGNORE)) return
        if (index > 0 && lines[index - 1].includes(IGNORE)) return
        const trimmed = line.trim()
        if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) return
        const hex = line.match(COLOR_HEX)
        const rgb = line.match(COLOR_RGB)
        for (const hit of [...(hex || []), ...(rgb || [])]) {
          violations.push(`${file}:${index + 1}: ${hit.trim()}`)
        }
      })
    }
  }
}

console.log(`[check-hardcoded-colors] scanned ${checked} files`)
if (violations.length) {
  console.error(`[check-hardcoded-colors] ${violations.length} hardcoded color(s) found:`)
  for (const v of violations) console.error('  ' + v)
  process.exit(1)
}
console.log('[check-hardcoded-colors] OK — no hardcoded colors outside whitelist')
