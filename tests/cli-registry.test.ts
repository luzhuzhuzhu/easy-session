import { describe, expect, it } from 'vitest'

// FEAT-2：CLI 注册表驱动单测——session:create schema / cli:check 白名单由注册表派生。
import { CLI_REGISTRY, getCliRegistryEntry, getProbeableCliIds, hasNativeSessionCandidates } from '../src/main/ipc/cli-registry'
import { CLI_TYPES } from '../src/shared/cli-types'

describe('cli registry (FEAT-2)', () => {
  it('registry ids stay in sync with shared CLI_TYPES', () => {
    expect([...CLI_REGISTRY.map((entry) => entry.id)].sort()).toEqual([...CLI_TYPES].sort())
  })

  it('every entry has an options schema', () => {
    for (const entry of CLI_REGISTRY) {
      expect(entry.optionsSchema).toBeTruthy()
      const parsed = entry.optionsSchema.safeParse({})
      expect(parsed.success).toBe(true)
    }
  })

  it('probeable cli list excludes terminal and covers entries with path settings', () => {
    const probeable = getProbeableCliIds()
    expect(probeable).toContain('claude')
    expect(probeable).toContain('codex')
    expect(probeable).toContain('opencode')
    expect(probeable).not.toContain('terminal')
  })

  it('declares native session candidate capability explicitly', () => {
    expect(hasNativeSessionCandidates('grok')).toBe(true)
    expect(hasNativeSessionCandidates('gemini')).toBe(true)
    expect(hasNativeSessionCandidates('terminal')).toBe(false)
    expect(hasNativeSessionCandidates('hermes')).toBe(true)
    expect(hasNativeSessionCandidates('nope')).toBe(false)
  })

  it('lookup by id returns entries, unknown ids miss', () => {
    expect(getCliRegistryEntry('claude')?.settingsPathKey).toBe('claudePath')
    expect(getCliRegistryEntry('nope')).toBeUndefined()
  })
})
