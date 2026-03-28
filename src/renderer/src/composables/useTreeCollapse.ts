import { reactive, computed, watch, type Ref } from 'vue'

export interface UseTreeCollapseOptions {
  persistKey?: string
}

export function useTreeCollapse(options: UseTreeCollapseOptions = {}): {
  collapsedKeys: Ref<Set<string>>
  isCollapsed: (key: string) => boolean
  toggleCollapse: (key: string) => void
  setCollapsed: (key: string, collapsed: boolean) => void
  expandAll: () => void
  collapseAll: (keys?: string[]) => void
} {
  const { persistKey } = options

  const collapsedKeys = reactive<Set<string>>(new Set())

  if (persistKey) {
    try {
      const stored = window.localStorage.getItem(persistKey)
      if (stored) {
        const parsed = JSON.parse(stored)
        if (Array.isArray(parsed)) {
          parsed.forEach((key) => collapsedKeys.add(key))
        }
      }
    } catch {
      // Ignore storage errors
    }
  }

  watch(
    () => Array.from(collapsedKeys),
    (keys) => {
      if (!persistKey) return
      try {
        window.localStorage.setItem(persistKey, JSON.stringify(keys))
      } catch {
        // Ignore storage errors
      }
    },
    { deep: true }
  )

  function isCollapsed(key: string): boolean {
    return collapsedKeys.has(key)
  }

  function toggleCollapse(key: string): void {
    if (isCollapsed(key)) {
      collapsedKeys.delete(key)
    } else {
      collapsedKeys.add(key)
    }
  }

  function setCollapsed(key: string, collapsed: boolean): void {
    if (collapsed) {
      collapsedKeys.add(key)
    } else {
      collapsedKeys.delete(key)
    }
  }

  function expandAll(): void {
    collapsedKeys.clear()
  }

  function collapseAll(keys?: string[]): void {
    if (keys) {
      keys.forEach((key) => collapsedKeys.add(key))
    }
  }

  return {
    collapsedKeys: computed(() => collapsedKeys) as unknown as Ref<Set<string>>,
    isCollapsed,
    toggleCollapse,
    setCollapsed,
    expandAll,
    collapseAll
  }
}

export function useTreeCollapseArray(options: UseTreeCollapseOptions = {}): {
  collapsedKeys: Ref<string[]>
  isCollapsed: (key: string) => boolean
  toggleCollapse: (key: string) => void
  setCollapsed: (key: string, collapsed: boolean) => void
  expandAll: () => void
  collapseAll: (keys?: string[]) => void
} {
  const { persistKey } = options

  const collapsedKeys = reactive<string[]>([])

  if (persistKey) {
    try {
      const stored = window.localStorage.getItem(persistKey)
      if (stored) {
        const parsed = JSON.parse(stored)
        if (Array.isArray(parsed)) {
          collapsedKeys.push(...parsed)
        }
      }
    } catch {
      // Ignore storage errors
    }
  }

  watch(
    collapsedKeys,
    (keys) => {
      if (!persistKey) return
      try {
        window.localStorage.setItem(persistKey, JSON.stringify(keys))
      } catch {
        // Ignore storage errors
      }
    },
    { deep: true }
  )

  function isCollapsed(key: string): boolean {
    return collapsedKeys.includes(key)
  }

  function toggleCollapse(key: string): void {
    if (isCollapsed(key)) {
      const index = collapsedKeys.indexOf(key)
      if (index > -1) {
        collapsedKeys.splice(index, 1)
      }
    } else {
      collapsedKeys.push(key)
    }
  }

  function setCollapsed(key: string, collapsed: boolean): void {
    if (collapsed && !isCollapsed(key)) {
      collapsedKeys.push(key)
    } else if (!collapsed && isCollapsed(key)) {
      const index = collapsedKeys.indexOf(key)
      if (index > -1) {
        collapsedKeys.splice(index, 1)
      }
    }
  }

  function expandAll(): void {
    collapsedKeys.length = 0
  }

  function collapseAll(keys?: string[]): void {
    if (keys) {
      keys.forEach((key) => {
        if (!isCollapsed(key)) {
          collapsedKeys.push(key)
        }
      })
    }
  }

  return {
    collapsedKeys: computed(() => collapsedKeys) as unknown as Ref<string[]>,
    isCollapsed,
    toggleCollapse,
    setCollapsed,
    expandAll,
    collapseAll
  }
}