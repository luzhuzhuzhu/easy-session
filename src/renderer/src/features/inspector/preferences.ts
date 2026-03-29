import type { InspectorTab } from './types'

export const INSPECTOR_PANEL_OPEN_KEY = 'easysession.inspector.panel-open'
export const INSPECTOR_ACTIVE_TAB_KEY = 'easysession.inspector.active-tab'
export const INSPECTOR_AUTO_FOLLOW_KEY = 'easysession.inspector.auto-follow'
export const INSPECTOR_SIDEBAR_VISIBLE_KEY = 'easysession.inspector.sidebar-visible'
export const INSPECTOR_SIDEBAR_AUTO_COLLAPSE_KEY = 'easysession.inspector.sidebar-auto-collapse'
const INSPECTOR_PREF_WRITE_DEBOUNCE_MS = 120

const pendingPreferenceTimers = new Map<string, ReturnType<typeof setTimeout>>()
const pendingPreferenceValues = new Map<string, string>()

export function readStoredInspectorBoolean(key: string, fallback: boolean): boolean {
  const stored = window.localStorage.getItem(key)
  if (stored == null) return fallback
  return stored === '1'
}

export function persistInspectorBoolean(key: string, value: boolean): void {
  persistStoredInspectorValue(key, value ? '1' : '0')
}

export function readStoredInspectorTab(): InspectorTab {
  const stored = window.localStorage.getItem(INSPECTOR_ACTIVE_TAB_KEY)
  if (stored === 'changes' || stored === 'files' || stored === 'history') return stored
  return 'changes'
}

export function persistInspectorTab(value: InspectorTab): void {
  persistStoredInspectorValue(INSPECTOR_ACTIVE_TAB_KEY, value)
}

function persistStoredInspectorValue(key: string, value: string): void {
  const pendingValue = pendingPreferenceValues.get(key)
  if (pendingValue === value) {
    return
  }

  if (window.localStorage.getItem(key) === value && pendingValue == null) {
    return
  }

  pendingPreferenceValues.set(key, value)

  const existingTimer = pendingPreferenceTimers.get(key)
  if (existingTimer) {
    clearTimeout(existingTimer)
  }

  const timer = setTimeout(() => {
    pendingPreferenceTimers.delete(key)
    const nextValue = pendingPreferenceValues.get(key)
    pendingPreferenceValues.delete(key)
    if (nextValue == null) return
    if (window.localStorage.getItem(key) === nextValue) return
    window.localStorage.setItem(key, nextValue)
  }, INSPECTOR_PREF_WRITE_DEBOUNCE_MS)

  pendingPreferenceTimers.set(key, timer)
}
