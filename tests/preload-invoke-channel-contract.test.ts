import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'

function collectQuotedChannels(source: string, startMarker: string, endMarker: string): Set<string> {
  const start = source.indexOf(startMarker)
  const end = source.indexOf(endMarker, start)
  if (start < 0 || end < 0) throw new Error(`Unable to locate channel list: ${startMarker}`)
  return new Set(Array.from(source.slice(start, end).matchAll(/'([^']+)'/g), (match) => match[1]))
}

function collectRendererInvokeChannels(source: string): string[] {
  return Array.from(
    source.matchAll(/ipc\.invoke(?:<[^;\n]*?>)?\(\s*'([^']+)'/g),
    (match) => match[1]
  )
}

describe('preload invoke channel contract', () => {
  it('allows every literal IPC channel used by renderer APIs', () => {
    const root = resolve(__dirname, '..')
    const preloadSource = readFileSync(resolve(root, 'src/preload/index.ts'), 'utf8')
    const allowed = collectQuotedChannels(
      preloadSource,
      'const ALLOWED_INVOKE_CHANNELS',
      'const ALLOWED_RECEIVE_CHANNELS'
    )
    const rendererApiSources = readdirSync(resolve(root, 'src/renderer/src/api'), { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith('.ts'))
      .map((entry) => readFileSync(resolve(root, 'src/renderer/src/api', entry.name), 'utf8'))
    const used = new Set(rendererApiSources.flatMap(collectRendererInvokeChannels))
    const missing = Array.from(used).filter((channel) => !allowed.has(channel)).sort()

    expect(missing).toEqual([])
  })
})
