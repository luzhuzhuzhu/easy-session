import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdirSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { randomUUID } from 'crypto'
import {
  candidateCollectorFor,
  collectClaudeSessionCandidates,
  collectGeminiSessionCandidates,
  collectGrokSessionCandidates,
  collectHermesSessionCandidates,
  collectOmpSessionCandidates,
  collectPiSessionCandidates,
  parseGrokSessionListOutput
} from '../src/main/services/native-session-candidates'

function writeJsonl(filePath: string, records: unknown[]): void {
  mkdirSync(join(filePath, '..'), { recursive: true })
  writeFileSync(filePath, `${records.map((record) => JSON.stringify(record)).join('\n')}\n`, 'utf8')
}

describe('native session candidates', () => {
  let root: string
  let previousClaudeConfigDir: string | undefined

  beforeEach(() => {
    root = join(process.cwd(), '.tmp-native-candidates', randomUUID())
    previousClaudeConfigDir = process.env.CLAUDE_CONFIG_DIR
  })

  afterEach(() => {
    if (previousClaudeConfigDir === undefined) delete process.env.CLAUDE_CONFIG_DIR
    else process.env.CLAUDE_CONFIG_DIR = previousClaudeConfigDir
    rmSync(root, { recursive: true, force: true })
  })

  it('collects Claude transcripts by exact cwd and ignores subagent files', async () => {
    writeJsonl(join(root, 'projects', 'D--EasySession', 'claude-id.jsonl'), [
      { type: 'mode', cwd: 'D:/EasySession' },
      { type: 'user', sessionId: 'claude-id', cwd: 'D:/EasySession', message: { role: 'user', content: 'Build the app' } },
      { type: 'assistant', timestamp: '2026-09-05T10:00:00.000Z' }
    ])
    writeJsonl(join(root, 'projects', 'D--EasySession', 'subagents', 'ignored.jsonl'), [
      { type: 'user', sessionId: 'ignored', cwd: 'D:/EasySession', message: { role: 'user', content: 'Do not include' } }
    ])

    const result = await collectClaudeSessionCandidates('D:/EasySession', join(root, 'projects'))
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ id: 'claude-id', projectPath: 'D:/EasySession', title: 'Build the app' })
  })

  it('collects Gemini JSON and JSONL sessions only with persisted UUID and matching project root', async () => {
    const geminiRoot = join(root, 'gemini')
    const matchingBucket = join(geminiRoot, 'tmp', 'easy-session')
    const otherBucket = join(geminiRoot, 'tmp', 'other')
    mkdirSync(join(matchingBucket, 'chats'), { recursive: true })
    mkdirSync(join(otherBucket, 'chats'), { recursive: true })
    writeFileSync(join(geminiRoot, 'projects.json'), JSON.stringify({
      projects: { 'D:/EasySession': 'easy-session', 'D:/Other': 'other' }
    }))
    writeFileSync(join(matchingBucket, 'chats', 'session-old.json'), JSON.stringify({
      sessionId: '11111111-1111-4111-8111-111111111111',
      lastUpdated: '2026-09-04T10:00:00.000Z',
      messages: [{ type: 'user', content: 'Implement Gemini candidates' }]
    }))
    writeJsonl(join(matchingBucket, 'chats', 'session-new.jsonl'), [
      {
        sessionId: '22222222-2222-4222-8222-222222222222',
        startTime: '2026-09-05T10:00:00.000Z',
        lastUpdated: '2026-09-05T11:00:00.000Z',
        kind: 'main'
      }
    ])
    writeJsonl(join(matchingBucket, 'chats', 'session-no-id.jsonl'), [{ lastUpdated: '2026-09-05T12:00:00.000Z' }])
    writeFileSync(join(otherBucket, 'chats', 'session-other.json'), JSON.stringify({
      sessionId: '33333333-3333-4333-8333-333333333333'
    }))

    const result = await collectGeminiSessionCandidates('d:/easysession', geminiRoot)
    expect(result).toHaveLength(2)
    expect(result.map((candidate) => candidate.id)).toEqual([
      '22222222-2222-4222-8222-222222222222',
      '11111111-1111-4111-8111-111111111111'
    ])
    expect(result[1]).toMatchObject({
      title: 'Implement Gemini candidates',
      projectPath: 'D:/EasySession'
    })
  })

  it('uses Gemini .project_root fallback and never infers an ID from the filename', async () => {
    const geminiRoot = join(root, 'gemini')
    const bucket = join(geminiRoot, 'tmp', 'legacy-hash')
    mkdirSync(join(bucket, 'chats'), { recursive: true })
    writeFileSync(join(bucket, '.project_root'), 'D:/EasySession\n')
    writeFileSync(join(bucket, 'chats', 'session-2026-09-05T10-00-deadbeef.json'), JSON.stringify({
      lastUpdated: '2026-09-05T10:00:00.000Z',
      messages: [{ type: 'user', content: 'Filename is not an ID' }]
    }))

    expect(await collectGeminiSessionCandidates('D:/EasySession', geminiRoot)).toEqual([])
    expect(candidateCollectorFor('gemini')).toBeTruthy()
  })

  it('uses CLAUDE_CONFIG_DIR as config root with distinct projects and history paths', async () => {
    const configRoot = join(root, 'custom-claude')
    process.env.CLAUDE_CONFIG_DIR = configRoot
    writeJsonl(join(configRoot, 'projects', 'D--EasySession', 'transcript.jsonl'), [
      { type: 'user', sessionId: 'env-transcript', cwd: 'D:/EasySession', message: { content: 'Transcript from env root' } }
    ])
    writeJsonl(join(configRoot, 'history.jsonl'), [
      { sessionId: 'env-history', project: 'D:/EasySession', display: 'History from env root' }
    ])

    const result = await collectClaudeSessionCandidates('D:/EasySession')
    expect(result).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'env-transcript', title: 'Transcript from env root' }),
      expect.objectContaining({ id: 'env-history', title: 'History from env root' })
    ]))
  })

  it('merges Claude summary, ai-title and history fallback while filtering synthetic prompts', async () => {
    const claudeHome = join(root, 'claude')
    writeJsonl(join(claudeHome, 'projects', 'D--EasySession', 'summary.jsonl'), [
      { type: 'user', sessionId: 'summary-id', cwd: 'D:/EasySession', message: { content: '<system-reminder>ignore</system-reminder>' } },
      { type: 'ai-title', sessionId: 'summary-id', cwd: 'D:/EasySession', aiTitle: 'Generated title' },
      { type: 'summary', sessionId: 'summary-id', cwd: 'D:/EasySession', summary: 'Authoritative summary' },
      { type: 'user', sessionId: 'summary-id', cwd: 'D:/EasySession', message: { content: 'Real transcript prompt' } }
    ])
    writeJsonl(join(claudeHome, 'history.jsonl'), [
      { sessionId: 'history-id', project: 'D:/EasySession', display: 'History display', timestamp: 1_780_000_000_000 },
      { sessionId: 'summary-id', project: 'D:/EasySession', display: 'Duplicate history prompt', timestamp: 1_780_000_001_000 }
    ])

    const result = await collectClaudeSessionCandidates('D:/EasySession', join(claudeHome, 'projects'), join(claudeHome, 'history.jsonl'))
    expect(result).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'summary-id', title: 'Authoritative summary', content: 'Real transcript prompt', titleSource: 'summary' }),
      expect.objectContaining({ id: 'history-id', title: 'History display', titleSource: 'first-user-message' })
    ]))
    expect(new Set(result.map((candidate) => candidate.id)).size).toBe(result.length)
  })

  it('aggregates Gemini JSONL records and rejects conflicting IDs and oversized JSON', async () => {
    const geminiRoot = join(root, 'gemini')
    const bucket = join(geminiRoot, 'tmp', 'easy-session')
    mkdirSync(join(bucket, 'chats'), { recursive: true })
    writeFileSync(join(bucket, '.project_root'), 'D:/EasySession')
    writeJsonl(join(bucket, 'chats', 'session-valid.jsonl'), [
      { sessionId: '44444444-4444-4444-8444-444444444444', startTime: '2026-09-05T10:00:00Z' },
      { type: 'user', content: 'Later JSONL prompt', lastUpdated: '2026-09-05T11:00:00Z' }
    ])
    writeJsonl(join(bucket, 'chats', 'session-conflict.jsonl'), [
      { sessionId: '55555555-5555-4555-8555-555555555555' },
      { sessionId: '66666666-6666-4666-8666-666666666666', type: 'user', content: 'Reject me' }
    ])
    writeFileSync(join(bucket, 'chats', 'session-huge.json'), JSON.stringify({
      sessionId: '77777777-7777-4777-8777-777777777777',
      messages: [{ type: 'user', content: 'x'.repeat(2 * 1024 * 1024) }]
    }))

    const result = await collectGeminiSessionCandidates('D:/EasySession', geminiRoot)
    expect(result).toEqual([expect.objectContaining({
      id: '44444444-4444-4444-8444-444444444444', title: 'Later JSONL prompt', titleSource: 'first-user-message'
    })])
  })

  it('collects Pi sessions only from valid session headers', async () => {
    writeJsonl(join(root, 'pi', 'sessions', '--D--EasySession--', 'pi-session.jsonl'), [
      { type: 'session', id: 'pi-id', timestamp: '2026-09-05T10:00:00.000Z', cwd: 'D:/EasySession' }
    ])
    writeJsonl(join(root, 'pi', 'sessions', '--D--EasySession--', 'artifact.jsonl'), [
      { type: 'message', id: 'artifact', cwd: 'D:/EasySession' }
    ])

    const result = await collectPiSessionCandidates('D:/EasySession', [join(root, 'pi')])
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ id: 'pi-id', projectPath: 'D:/EasySession', title: 'Pi session', titleSource: 'fallback' })
  })

  it('uses the OMP title slot and filters by header cwd', async () => {
    writeJsonl(join(root, 'omp', 'sessions', '--D--EasySession--', 'omp-session.jsonl'), [
      { type: 'title', title: 'Release review', updatedAt: '2026-09-05T10:01:00.000Z' },
      { type: 'session', id: 'omp-id', title: 'Header title', timestamp: '2026-09-05T10:00:00.000Z', cwd: 'D:/EasySession' }
    ])

    const result = await collectOmpSessionCandidates('D:/EasySession', [join(root, 'omp')])
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ id: 'omp-id', title: 'Release review', titleSource: 'session-title', projectPath: 'D:/EasySession' })
  })

  it('strictly parses Grok session table rows with required candidate fields', () => {
    const output = [
      'SESSION ID                            CREATED              UPDATED              STATUS  SUMMARY',
      '01991234-1234-7123-8123-123456789abc  2026-09-04 10:00 UTC  2026-09-05 11:22 UTC  local   Implement strict parser',
      '01981234-1234-7123-8123-123456789abc  2026-09-03 10:00 UTC  2026-09-04 09:30 UTC  synced  Older session'
    ].join('\n')

    expect(parseGrokSessionListOutput(output, 'D:/EasySession')).toEqual([
      {
        id: '01991234-1234-7123-8123-123456789abc',
        title: 'Implement strict parser',
        titleSource: 'summary',
        updated: Date.parse('2026-09-05T11:22:00Z'),
        projectPath: 'D:/EasySession'
      },
      {
        id: '01981234-1234-7123-8123-123456789abc',
        title: 'Older session',
        titleSource: 'summary',
        updated: Date.parse('2026-09-04T09:30:00Z'),
        projectPath: 'D:/EasySession'
      }
    ])
    expect(parseGrokSessionListOutput(`Label: main\n${output}`, 'D:/EasySession')).toHaveLength(2)
    expect(parseGrokSessionListOutput([
      'SESSION ID                            CREATED              UPDATED              STATUS',
      '  SUMMARY',
      '01991234-1234-7123-8123-123456789abc  2026-09-04 10:00 UTC  2026-09-05 11:22 UTC  local',
      '  Implement strict parser'
    ].join('\n'), 'D:/EasySession')).toHaveLength(1)
    expect(parseGrokSessionListOutput('No sessions found.\n', 'D:/EasySession')).toEqual([])
  })

  it('rejects arbitrary or malformed Grok output instead of manufacturing candidates', () => {
    expect(() => parseGrokSessionListOutput('01991234-1234-7123-8123-123456789abc Some text', 'D:/EasySession'))
      .toThrow('Unsupported Grok sessions list format')
    expect(() => parseGrokSessionListOutput([
      'SESSION ID                            CREATED              UPDATED              STATUS  SUMMARY',
      'not-an-id                             yesterday            today                local   Looks plausible'
    ].join('\n'), 'D:/EasySession')).toThrow('Unsupported Grok sessions list format')
  })

  it('runs Grok listing with bounded execution and exact project cwd', async () => {
    const calls: Array<{ executable: string; args: string[]; options: Record<string, unknown> }> = []
    const projectPath = join(root, 'project')
    mkdirSync(projectPath, { recursive: true })
    const result = await collectGrokSessionCandidates(projectPath, 'C:/tools/grok.exe', 7, async (executable, args, options) => {
      calls.push({ executable, args, options })
      return { stdout: 'No sessions found.\n', stderr: '' }
    })

    expect(result).toEqual([])
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({
      executable: 'C:/tools/grok.exe',
      args: ['sessions', 'list', '--limit', '7'],
      options: { cwd: expect.stringContaining('project'), timeout: 5000, maxBuffer: 512 * 1024, windowsHide: true }
    })
  })

  it('collects Hermes SQLite sessions with exact cwd and confirmed title/content/activity fields', async () => {
    const { DatabaseSync } = await import('node:sqlite')
    const stateDbPath = join(root, 'hermes', 'state.db')
    mkdirSync(join(root, 'hermes'), { recursive: true })
    const database = new DatabaseSync(stateDbPath)
    database.exec(`
      CREATE TABLE sessions (
        id TEXT PRIMARY KEY, title TEXT, cwd TEXT, started_at REAL NOT NULL, last_activity_at REAL
      );
      CREATE TABLE messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT NOT NULL, role TEXT NOT NULL,
        content TEXT, timestamp REAL NOT NULL, active INTEGER NOT NULL DEFAULT 1
      );
    `)
    const insertSession = database.prepare('INSERT INTO sessions VALUES (?, ?, ?, ?, ?)')
    insertSession.run('matching', 'Release review', 'D:/EasySession', 100, 200)
    insertSession.run('nested', 'Nested checkout', 'D:/EasySession/packages/app', 300, 400)
    insertSession.run('other', 'Other project', 'D:/Other', 500, 600)
    insertSession.run('prompt-title', null, 'D:/EasySession/', 700, null)
    const insertMessage = database.prepare('INSERT INTO messages (session_id, role, content, timestamp, active) VALUES (?, ?, ?, ?, ?)')
    insertMessage.run('matching', 'user', 'Implement Hermes candidates', 250, 1)
    insertMessage.run('matching', 'user', 'Inactive newer prompt', 999, 0)
    insertMessage.run('prompt-title', 'user', '\0json:[{"type":"text","text":"Structured prompt"}]', 800, 1)
    database.close()

    const result = await collectHermesSessionCandidates('D:/EasySession', stateDbPath)
    expect(result).toEqual([
      {
        id: 'prompt-title',
        title: 'Structured prompt',
        content: 'Structured prompt',
        titleSource: 'first-user-message',
        updated: 800_000,
        projectPath: 'D:/EasySession/'
      },
      {
        id: 'matching',
        title: 'Release review',
        content: 'Implement Hermes candidates',
        titleSource: 'session-title',
        updated: 250_000,
        projectPath: 'D:/EasySession'
      }
    ])
  })

  it('tolerates missing and corrupt Hermes databases without leaking partial candidates', async () => {
    expect(await collectHermesSessionCandidates(root, join(root, 'missing.db'))).toEqual([])
    mkdirSync(root, { recursive: true })
    const corruptPath = join(root, 'state.db')
    writeFileSync(corruptPath, 'not a sqlite database')
    expect(await collectHermesSessionCandidates(root, corruptPath)).toEqual([])
    expect(candidateCollectorFor('hermes')).toBeTruthy()
  })

  it('surfaces Grok command and format failures and registers the provider', async () => {
    await expect(collectGrokSessionCandidates(root, undefined, 40, async () => {
      throw new Error('Grok session listing timed out')
    })).rejects.toThrow('timed out')
    await expect(collectGrokSessionCandidates(root, undefined, 40, async () => ({
      stdout: 'No sessions found.\n', stderr: 'warning'
    }))).rejects.toThrow('unexpected stderr')
    expect(candidateCollectorFor('grok')).toBeTruthy()
    expect(candidateCollectorFor('hermes')).toBeTruthy()
  })
})
