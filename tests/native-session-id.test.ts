// FEAT-1：nativeSessionId 归一化迁移单测。
// 旧平铺字段（claudeSessionId/codexSessionId/opencodeSessionId）→ readNativeSessionId / toUnifiedSession。
import { describe, expect, it } from 'vitest'
import { readNativeSessionId, toUnifiedSession, LOCAL_INSTANCE_ID } from '../src/renderer/src/models/unified-resource'
import type { Session } from '../src/renderer/src/api/local-session'

function makeSession(overrides: Partial<Session>): Session {
  return {
    id: 's1',
    name: 'Claude-001',
    icon: null,
    type: 'claude',
    projectPath: '/tmp/proj',
    status: 'stopped',
    createdAt: 1000,
    lastActiveAt: 1000,
    processId: null,
    options: {},
    parentId: null,
    ...overrides
  }
}

describe('nativeSessionId unification (FEAT-1)', () => {
  it('maps claude/codex/opencode native fields by cli type', () => {
    expect(readNativeSessionId({ type: 'claude', claudeSessionId: 'abc', codexSessionId: null, opencodeSessionId: null })).toBe('abc')
    expect(readNativeSessionId({ type: 'codex', claudeSessionId: null, codexSessionId: 'xyz', opencodeSessionId: null })).toBe('xyz')
    expect(readNativeSessionId({ type: 'opencode', claudeSessionId: null, codexSessionId: null, opencodeSessionId: 'ooo' })).toBe('ooo')
  })

  it('returns null for terminal sessions and undefined fields', () => {
    expect(readNativeSessionId({ type: 'terminal', claudeSessionId: null, codexSessionId: null, opencodeSessionId: null })).toBeNull()
    expect(readNativeSessionId({ type: 'claude', claudeSessionId: undefined, codexSessionId: null, opencodeSessionId: null })).toBeNull()
  })

  it('toUnifiedSession derives nativeSessionId from legacy flat fields', () => {
    const legacy = makeSession({ type: 'codex', codexSessionId: 'legacy-456' })
    const unified = toUnifiedSession(legacy, { instanceId: LOCAL_INSTANCE_ID })
    expect(unified.nativeSessionId).toBe('legacy-456')
    // 旧字段保留回写兼容
    expect(unified.codexSessionId).toBe('legacy-456')
  })

  it('toUnifiedSession keeps nativeSessionId null when no native id present', () => {
    const unified = toUnifiedSession(makeSession({ type: 'terminal' }), {})
    expect(unified.nativeSessionId).toBeNull()
  })
})
