<template>
  <div class="markdown-preview" :style="viewerStyle">
    <article class="markdown-article" v-html="html"></article>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import MarkdownIt from 'markdown-it'
import markdownItTaskLists from 'markdown-it-task-lists'
import markdownItFootnote from 'markdown-it-footnote'

defineOptions({ name: 'MarkdownPreview' })

const props = defineProps<{
  content: string
  sourcePath?: string | null
  zoomPercent?: number
}>()

const markdownRendererCache = new Map<string, any>()
const markdownHtmlCache = new Map<string, string>()

const viewerStyle = computed(() => ({
  '--viewer-scale': String((props.zoomPercent ?? 100) / 100)
}))

function pathToFileUrl(pathValue: string): string {
  const normalized = pathValue.replace(/\\/g, '/')
  if (/^[A-Za-z]:\//.test(normalized)) {
    return `file:///${encodeURI(normalized)}`
  }
  if (normalized.startsWith('/')) {
    return `file://${encodeURI(normalized)}`
  }
  return `file:///${encodeURI(normalized)}`
}

function normalizeBaseDir(pathValue: string): string | null {
  if (!pathValue) return null
  const normalized = pathValue.replace(/\\/g, '/')
  const index = normalized.lastIndexOf('/')
  if (index < 0) return null
  return normalized.slice(0, index + 1)
}

function resolveAssetUrl(rawUrl: string, sourcePath?: string | null): string {
  const trimmed = rawUrl.trim()
  if (!trimmed) return '#'
  if (/^(https?:|mailto:|file:|data:|#)/i.test(trimmed)) return trimmed

  const baseDir = sourcePath ? normalizeBaseDir(sourcePath) : null
  if (!baseDir) return trimmed

  try {
    return new URL(trimmed, pathToFileUrl(baseDir)).toString()
  } catch {
    return trimmed
  }
}

function renderGithubAlerts(html: string): string {
  return html.replace(
    /<blockquote>\s*<p>\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*([\s\S]*?)<\/p>/gi,
    (_match, kind: string, content: string) => {
      const type = kind.toLowerCase()
      const title = kind[0].toUpperCase() + kind.slice(1).toLowerCase()
      return `<blockquote class="markdown-callout markdown-callout-${type}"><p class="markdown-callout-title">${title}</p><p>${content}</p>`
    }
  )
}

function renderExtendedTaskStates(html: string): string {
  return html
    .replace(
      /<li>([\s\S]*?)\[-\]\s+([\s\S]*?)<\/li>/g,
      (_match, prefix: string, content: string) =>
        `<li class="task-list-item task-list-item-indeterminate">${prefix}<label class="task-list-item-label"><span class="task-list-item-box is-indeterminate" aria-hidden="true"></span><span>${content}</span></label></li>`
    )
    .replace(
      /<li><p>\[-\]\s+([\s\S]*?)<\/p>/g,
      (_match, content: string) =>
        `<li class="task-list-item task-list-item-indeterminate"><p><label class="task-list-item-label"><span class="task-list-item-box is-indeterminate" aria-hidden="true"></span><span>${content}</span></label></p>`
    )
}

function createMarkdownRenderer(sourcePath?: string | null): any {
  const cacheKey = sourcePath ?? ''
  const cached = markdownRendererCache.get(cacheKey)
  if (cached) {
    return cached
  }

  const markdown = new MarkdownIt({
    html: true,
    linkify: true,
    typographer: false,
    breaks: false
  })

  markdown.use(markdownItTaskLists, {
    enabled: true,
    label: true,
    labelAfter: true
  })
  markdown.use(markdownItFootnote)

  const defaultLinkOpen =
    markdown.renderer.rules.link_open ??
    ((tokens: any, idx: number, options: any, _env: any, self: any) => self.renderToken(tokens, idx, options))

  markdown.renderer.rules.link_open = (tokens: any, idx: number, options: any, env: any, self: any) => {
    const hrefIndex = tokens[idx].attrIndex('href')
    if (hrefIndex >= 0) {
      const href = tokens[idx].attrs?.[hrefIndex]?.[1] ?? ''
      tokens[idx].attrs![hrefIndex][1] = resolveAssetUrl(href, sourcePath)
    }
    tokens[idx].attrSet('target', '_blank')
    tokens[idx].attrSet('rel', 'noreferrer')
    return defaultLinkOpen(tokens, idx, options, env, self)
  }

  const defaultImage =
    markdown.renderer.rules.image ??
    ((tokens: any, idx: number, options: any, _env: any, self: any) => self.renderToken(tokens, idx, options))

  markdown.renderer.rules.image = (tokens: any, idx: number, options: any, env: any, self: any) => {
    const srcIndex = tokens[idx].attrIndex('src')
    if (srcIndex >= 0) {
      const src = tokens[idx].attrs?.[srcIndex]?.[1] ?? ''
      tokens[idx].attrs![srcIndex][1] = resolveAssetUrl(src, sourcePath)
    }
    return defaultImage(tokens, idx, options, env, self)
  }

  markdownRendererCache.set(cacheKey, markdown)
  return markdown
}

const html = computed(() => {
  const sourcePath = props.sourcePath ?? ''
  const normalizedContent = props.content.replace(/^\uFEFF/, '')
  const cacheKey = `${sourcePath}::${normalizedContent}`
  const cached = markdownHtmlCache.get(cacheKey)
  if (cached != null) {
    return cached
  }

  const renderer = createMarkdownRenderer(props.sourcePath)
  const rawHtml = renderer.render(normalizedContent)
  const rendered = renderExtendedTaskStates(renderGithubAlerts(rawHtml))

  markdownHtmlCache.set(cacheKey, rendered)
  if (markdownHtmlCache.size > 24) {
    const oldestKey = markdownHtmlCache.keys().next().value
    if (oldestKey) {
      markdownHtmlCache.delete(oldestKey)
    }
  }

  return rendered
})
</script>

<style scoped lang="scss">
.markdown-preview {
  --viewer-scale: 1;

  height: 100%;
  min-height: 0;
  overflow: auto;
  contain: content;
  padding: calc(24px * var(--viewer-scale)) calc(28px * var(--viewer-scale)) calc(40px * var(--viewer-scale));
  background: var(--bg-primary);
}

.markdown-article {
  max-width: 860px;
  margin: 0 auto;
  color: var(--text-primary);
  line-height: 1.78;
  font-size: calc(14px * var(--viewer-scale));

  :deep(h1),
  :deep(h2),
  :deep(h3),
  :deep(h4),
  :deep(h5),
  :deep(h6) {
    margin: 24px 0 12px;
    color: var(--text-primary);
    font-weight: 700;
    line-height: 1.25;
  }

  :deep(h1) {
    font-size: calc(28px * var(--viewer-scale));
  }

  :deep(h2) {
    font-size: calc(22px * var(--viewer-scale));
  }

  :deep(h3) {
    font-size: calc(18px * var(--viewer-scale));
  }

  :deep(p),
  :deep(ul),
  :deep(ol),
  :deep(blockquote),
  :deep(pre),
  :deep(table),
  :deep(figure) {
    margin: 0 0 14px;
  }

  :deep(ul),
  :deep(ol) {
    padding-left: 22px;
  }

  :deep(li > ul),
  :deep(li > ol) {
    margin-top: 6px;
    margin-bottom: 0;
  }

  :deep(li + li) {
    margin-top: 4px;
  }

  :deep(ul.contains-task-list),
  :deep(ol.contains-task-list) {
    padding-left: 0;
    list-style: none;
  }

  :deep(.task-list-item) {
    list-style: none;
  }

  :deep(.task-list-item-label) {
    display: inline-flex;
    align-items: flex-start;
    gap: 8px;
  }

  :deep(.task-list-item-checkbox),
  :deep(ul input[type='checkbox']),
  :deep(ol input[type='checkbox']) {
    margin: 0 8px 0 0;
    accent-color: var(--accent-primary);
  }

  :deep(.task-list-item-box) {
    position: relative;
    flex: 0 0 auto;
    width: 14px;
    height: 14px;
    margin-top: 2px;
    border: 1px solid var(--border-color);
    background: var(--bg-secondary);
  }

  :deep(.task-list-item-box.is-indeterminate::after) {
    content: '';
    position: absolute;
    top: 50%;
    left: 2px;
    right: 2px;
    height: 2px;
    transform: translateY(-50%);
    background: color-mix(in srgb, var(--text-primary) 72%, var(--status-warning) 28%);
  }

  :deep(blockquote) {
    margin-left: 0;
    padding: 10px 14px;
    border-left: 3px solid var(--border-color);
    color: var(--text-secondary);
    background: var(--bg-secondary);
  }

  :deep(blockquote > :last-child) {
    margin-bottom: 0;
  }

  :deep(.markdown-callout) {
    border-left-width: 4px;
  }

  :deep(.markdown-callout-title) {
    margin: 0 0 6px;
    font-size: calc(12px * var(--viewer-scale));
    font-weight: 700;
    letter-spacing: 0.02em;
    text-transform: uppercase;
    color: var(--text-primary);
  }

  :deep(.markdown-callout-note) {
    border-left-color: #60a5fa;
  }

  :deep(.markdown-callout-tip) {
    border-left-color: #34d399;
  }

  :deep(.markdown-callout-important) {
    border-left-color: #a78bfa;
  }

  :deep(.markdown-callout-warning) {
    border-left-color: #fbbf24;
  }

  :deep(.markdown-callout-caution) {
    border-left-color: #f87171;
  }

  :deep(code) {
    font-family: var(--font-mono);
    font-size: calc(12.5px * var(--viewer-scale));
  }

  :deep(p code),
  :deep(li code),
  :deep(blockquote code),
  :deep(td code),
  :deep(th code) {
    padding: calc(1px * var(--viewer-scale)) calc(5px * var(--viewer-scale));
    border: 1px solid var(--border-color);
    background: var(--bg-secondary);
  }

  :deep(pre) {
    padding: calc(14px * var(--viewer-scale)) calc(16px * var(--viewer-scale));
    overflow: auto;
    border: 1px solid var(--border-color);
    background: color-mix(in srgb, var(--bg-secondary) 88%, var(--bg-primary) 12%);
  }

  :deep(pre code) {
    display: block;
    min-width: max-content;
    line-height: 1.65;
  }

  :deep(a) {
    color: var(--accent-primary);
    text-decoration: underline;
  }

  :deep(img) {
    display: block;
    max-width: 100%;
    height: auto;
    border: 1px solid var(--border-color);
    background: var(--bg-secondary);
  }

  :deep(del) {
    color: var(--text-secondary);
  }

  :deep(.table-wrap) {
    overflow: auto;
    border: 1px solid var(--border-color);
    background: var(--bg-secondary);
  }

  :deep(table) {
    width: 100%;
    min-width: max-content;
    border-collapse: collapse;
  }

  :deep(th),
  :deep(td) {
    padding: calc(8px * var(--viewer-scale)) calc(10px * var(--viewer-scale));
    border-bottom: 1px solid var(--border-color);
    border-right: 1px solid var(--border-color);
    text-align: left;
    vertical-align: top;
  }

  :deep(th:last-child),
  :deep(td:last-child) {
    border-right: none;
  }

  :deep(thead th) {
    background: color-mix(in srgb, var(--bg-secondary) 88%, var(--bg-tertiary) 12%);
    color: var(--text-primary);
    font-weight: 600;
  }

  :deep(tbody tr:last-child td) {
    border-bottom: none;
  }

  :deep(hr) {
    margin: 18px 0;
    border: none;
    border-top: 1px solid var(--border-color);
  }

  :deep(.footnotes) {
    margin-top: 28px;
    padding-top: 16px;
    border-top: 1px solid var(--border-color);
    color: var(--text-secondary);
  }

  :deep(.footnotes ol) {
    padding-left: 18px;
  }
}
</style>
