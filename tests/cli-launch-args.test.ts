import { describe, expect, it } from 'vitest'
import {
  CLAUDE_BUILTIN_ARGS,
  CODEX_BUILTIN_ARGS,
  builtinStateToArgs,
  createEmptyBuiltinState,
  getBuiltinArgDescriptors,
  normalizeLaunchArgPresets,
  splitArgsForForm
} from '../src/renderer/src/models/cli-launch-args'

describe('builtin launch arg descriptors', () => {
  it('returns descriptors for claude and codex, none for other types', () => {
    expect(getBuiltinArgDescriptors('claude')).toBe(CLAUDE_BUILTIN_ARGS)
    expect(getBuiltinArgDescriptors('codex')).toBe(CODEX_BUILTIN_ARGS)
    expect(getBuiltinArgDescriptors('terminal')).toEqual([])
    expect(getBuiltinArgDescriptors('opencode')).toEqual([])
  })

  it('omits empty values and unset toggles', () => {
    const state = createEmptyBuiltinState(CLAUDE_BUILTIN_ARGS)
    expect(builtinStateToArgs(state, CLAUDE_BUILTIN_ARGS)).toEqual([])
  })

  it('converts filled controls to customArgs entries', () => {
    const state = createEmptyBuiltinState(CLAUDE_BUILTIN_ARGS)
    state['--model'] = 'opus'
    state['--dangerously-skip-permissions'] = true
    state['--agent'] = '  reviewer  '

    expect(builtinStateToArgs(state, CLAUDE_BUILTIN_ARGS)).toEqual([
      { name: '--model', value: 'opus' },
      { name: '--dangerously-skip-permissions' },
      { name: '--agent', value: 'reviewer' }
    ])
  })
})

describe('splitArgsForForm', () => {
  it('routes known flags into builtin state and the rest into custom rows', () => {
    const { builtinState, customArgs } = splitArgsForForm(
      [
        { name: '--model', value: 'sonnet' },
        { name: '--dangerously-skip-permissions' },
        { name: '--future-flag', value: 'x' }
      ],
      CLAUDE_BUILTIN_ARGS
    )

    expect(builtinState['--model']).toBe('sonnet')
    expect(builtinState['--dangerously-skip-permissions']).toBe(true)
    expect(customArgs).toEqual([{ name: '--future-flag', value: 'x' }])
  })

  it('keeps select values outside the option list as custom rows (stale/new CLI values stay visible)', () => {
    const { builtinState, customArgs } = splitArgsForForm(
      [{ name: '--model', value: 'claude-fable-5-20260115' }],
      CLAUDE_BUILTIN_ARGS
    )

    expect(builtinState['--model']).toBe('')
    expect(customArgs).toEqual([{ name: '--model', value: 'claude-fable-5-20260115' }])
  })

  it('keeps duplicate flags as custom rows', () => {
    const { builtinState, customArgs } = splitArgsForForm(
      [
        { name: '--add-dir', value: 'D:/a' },
        { name: '--add-dir', value: 'D:/b' }
      ],
      CLAUDE_BUILTIN_ARGS
    )

    expect(builtinState['--add-dir']).toBe('D:/a')
    expect(customArgs).toEqual([{ name: '--add-dir', value: 'D:/b' }])
  })

  it('keeps a toggle flag with an unexpected value as a custom row', () => {
    const { builtinState, customArgs } = splitArgsForForm(
      [{ name: '--dangerously-skip-permissions', value: 'true' }],
      CLAUDE_BUILTIN_ARGS
    )

    expect(builtinState['--dangerously-skip-permissions']).toBe(false)
    expect(customArgs).toEqual([{ name: '--dangerously-skip-permissions', value: 'true' }])
  })

  it('round-trips builtin state through args and back', () => {
    const state = createEmptyBuiltinState(CODEX_BUILTIN_ARGS)
    state['--model'] = 'gpt-5.5-codex'
    state['--search'] = true

    const args = builtinStateToArgs(state, CODEX_BUILTIN_ARGS)
    const { builtinState, customArgs } = splitArgsForForm(args, CODEX_BUILTIN_ARGS)

    expect(builtinState).toEqual(state)
    expect(customArgs).toEqual([])
  })
})

describe('normalizeLaunchArgPresets', () => {
  it('drops malformed entries and trims values', () => {
    const presets = normalizeLaunchArgPresets([
      { id: 'p1', name: ' YOLO ', cliType: 'claude', args: [{ name: ' --model ', value: ' opus ' }, { name: '' }] },
      { id: 'p2', name: 'bad type', cliType: 'terminal', args: [] },
      { id: '', name: 'no id', cliType: 'codex', args: [] },
      'not-an-object',
      { id: 'p3', name: 'codex preset', cliType: 'codex', args: 'not-an-array' }
    ])

    expect(presets).toEqual([
      { id: 'p1', name: 'YOLO', cliType: 'claude', args: [{ name: '--model', value: 'opus' }] },
      { id: 'p3', name: 'codex preset', cliType: 'codex', args: [] }
    ])
  })

  it('returns an empty list for non-array input', () => {
    expect(normalizeLaunchArgPresets(undefined)).toEqual([])
    expect(normalizeLaunchArgPresets({})).toEqual([])
  })
})
