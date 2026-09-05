import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { CLI_TYPES, type CliType } from '@shared/cli-types'

interface CliCheckResult {
  available: boolean
  path?: string
  version?: string
}

interface CliPathSettings {
  claudePath?: string
  codexPath?: string
  opencodePath?: string
  [key: string]: string | undefined
}

// FEAT-1：CLI 可用性按 CliType 键控（循环检测），不再为每个 CLI 平铺三套 ref。
// 新增 CLI 时只需在 shared/cli-types.ts 注册 + settings 提供 <id>Path。
const PROBED_CLI_TYPES = CLI_TYPES.filter((t): t is Exclude<CliType, 'terminal'> => t !== 'terminal')

export const useAppStore = defineStore('app', () => {
  const platform = ref('')
  const version = ref('')
  const cliInfo = ref<Partial<Record<CliType, CliCheckResult>>>({})
  // Start in the "checking" state so the top bar shows a pulsing indicator on
  // launch instead of a misleading offline dot before the first probe lands.
  const cliChecking = ref(true)
  const cliChecked = ref(false)
  let cliCheckInflight: Promise<void> | null = null

  const cliAvailable = computed<Record<CliType, boolean>>(() => {
    const map = {} as Record<CliType, boolean>
    for (const type of CLI_TYPES) {
      map[type] = cliInfo.value[type]?.available ?? false
    }
    return map
  })

  // 兼容旧扁平字段名（claudeAvailable / claudeInfo 等）的读取视图。
  const availabilityByName = computed(() => {
    const map: Record<string, boolean> = {}
    const infoMap: Record<string, CliCheckResult> = {}
    for (const type of PROBED_CLI_TYPES) {
      map[`${type}Available`] = cliInfo.value[type]?.available ?? false
      infoMap[`${type}Info`] = cliInfo.value[type] ?? { available: false }
    }
    return { map, infoMap }
  })

  async function init() {
    platform.value = (await window.electronAPI.invoke('app:getPlatform')) as string
    version.value = (await window.electronAPI.invoke('app:getVersion')) as string
  }

  async function checkCliStatus(): Promise<void> {
    // Dedupe concurrent probes (top bar + dashboard mount together) so the
    // shared status is computed once per request burst.
    if (cliCheckInflight) return cliCheckInflight
    cliChecking.value = true
    cliCheckInflight = (async () => {
      try {
        const settings = (await window.electronAPI.invoke('settings:read')) as CliPathSettings
        const results = await Promise.all(
          PROBED_CLI_TYPES.map((type) =>
            window.electronAPI.invoke('cli:check', type, settings?.[`${type}Path`] || '') as Promise<CliCheckResult>
          )
        )
        const next: Partial<Record<CliType, CliCheckResult>> = {}
        PROBED_CLI_TYPES.forEach((type, index) => {
          next[type] = results[index]
        })
        cliInfo.value = next
      } finally {
        cliChecking.value = false
        cliChecked.value = true
        cliCheckInflight = null
      }
    })()
    return cliCheckInflight
  }

  return {
    platform,
    version,
    cliInfo,
    cliAvailable,
    availabilityByName,
    cliChecking,
    cliChecked,
    init,
    checkCliStatus
  }
})
