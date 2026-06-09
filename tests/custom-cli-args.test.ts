import { describe, expect, it, vi } from 'vitest'
import { ClaudeAdapter } from '../src/main/services/claude-adapter'
import { CodexAdapter } from '../src/main/services/codex-adapter'

describe('custom CLI launch arguments', () => {
  it('passes Claude custom startup arguments to the spawned process', () => {
    const cliManager = {
      spawn: vi.fn()
    }
    const adapter = new ClaudeAdapter(cliManager as any)

    adapter.startSession(
      'D:/repo/project-a',
      {
        customArgs: [
          { name: ' --permission-mode ', value: ' bypassPermissions ' },
          { name: '--verbose', value: '   ' }
        ]
      },
      'claude-session-id'
    )

    expect(cliManager.spawn).toHaveBeenCalledWith(
      expect.stringMatching(/^claude-/),
      'claude',
      [
        '--session-id',
        'claude-session-id',
        '--permission-mode',
        'bypassPermissions',
        '--verbose'
      ],
      { cwd: 'D:/repo/project-a' }
    )
  })

  it('keeps Codex preset arguments and appends custom startup arguments', () => {
    const cliManager = {
      spawn: vi.fn()
    }
    const adapter = new CodexAdapter(cliManager as any)

    adapter.startSession('D:/repo/project-a', {
      permissionsMode: 'default',
      customArgs: [
        { name: '--config', value: 'model_provider=local' },
        { name: '--dangerously-bypass-approvals-and-sandbox' }
      ]
    })

    expect(cliManager.spawn).toHaveBeenCalledWith(
      expect.stringMatching(/^codex-/),
      'codex',
      [
        '--no-alt-screen',
        '--sandbox',
        'workspace-write',
        '--ask-for-approval',
        'on-request',
        '--config',
        'model_provider=local',
        '--dangerously-bypass-approvals-and-sandbox'
      ],
      { cwd: 'D:/repo/project-a' }
    )
  })
})
