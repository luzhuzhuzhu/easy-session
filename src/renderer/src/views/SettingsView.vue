<template>
  <div class="settings-page">
    <header class="settings-header">
      <div class="settings-title-block">
        <h1>{{ $t('settings.title') }}</h1>
        <p>{{ $t('settings.subtitle') }}</p>
      </div>
      <div class="settings-search">
        <UiIcon name="search" />
        <input
          v-model.trim="settingsSearchQuery"
          type="search"
          :placeholder="$t('settings.searchPlaceholder')"
          :aria-label="$t('settings.searchPlaceholder')"
        />
      </div>
    </header>

    <div class="settings-shell">
      <nav class="settings-nav" :aria-label="$t('settings.sectionNav')">
        <button
          v-for="item in settingsNavItems"
          :key="item.id"
          class="settings-nav-item"
          :class="{ active: activeSettingsCategory === item.id }"
          type="button"
          @click="setSettingsCategory(item.id)"
        >
          <span class="settings-nav-marker" aria-hidden="true">{{ item.marker }}</span>
          <span class="settings-nav-copy">
            <span class="settings-nav-label">{{ item.label }}</span>
            <span class="settings-nav-count">{{ item.countLabel }}</span>
          </span>
        </button>
      </nav>

      <div class="settings-content">
        <div v-if="!hasVisibleSettingsSections" class="settings-empty-state">
          {{ $t('settings.searchNoResults') }}
        </div>

    <div v-show="shouldShowSettingsSection('general')" class="settings-section-group">
      <GeneralPreferencesSettingsSection
        :theme="settingsStore.settings.theme"
        :language="settingsStore.settings.language"
        :session-wake-confirm="settingsStore.settings.sessionWakeConfirm"
        :sessions-list-position="settingsStore.settings.sessionsListPosition"
        :sessions-panel-collapsed="settingsStore.settings.sessionsPanelCollapsed"
        :smart-priority-enabled="settingsStore.settings.smartPriorityEnabled"
        :smart-priority-scope="settingsStore.settings.smartPriorityScope"
        :smart-priority-mode="settingsStore.settings.smartPriorityMode"
        @update:theme="settingsStore.settings.theme = $event; handleSave()"
        @update:language="settingsStore.settings.language = $event; handleSave()"
        @update:session-wake-confirm="settingsStore.settings.sessionWakeConfirm = $event; handleSave()"
        @toggle-sessions-list-position="toggleSessionsListPosition"
        @update:sessions-panel-collapsed="settingsStore.settings.sessionsPanelCollapsed = $event; handleSave()"
        @update:smart-priority-enabled="settingsStore.settings.smartPriorityEnabled = $event; handleSave()"
        @update:smart-priority-scope="settingsStore.settings.smartPriorityScope = $event; handleSave()"
        @update:smart-priority-mode="settingsStore.settings.smartPriorityMode = $event; handleSave()"
      />
    </div>

    <div v-show="shouldShowSettingsSection('cli')" class="settings-section-group">
      <CliPathsSettingsSection
        :claude-path="settingsStore.settings.claudePath"
        :codex-path="settingsStore.settings.codexPath"
        :opencode-path="settingsStore.settings.opencodePath"
        @update:claude-path="settingsStore.settings.claudePath = $event; handleSave()"
        @update:codex-path="settingsStore.settings.codexPath = $event; handleSave()"
        @update:opencode-path="settingsStore.settings.opencodePath = $event; handleSave()"
      />
    </div>

    <div v-show="shouldShowSettingsSection('remote')" class="settings-remote-stack">
    <section class="remote-access-map" aria-labelledby="remote-access-map-title">
      <div class="remote-access-map-head">
        <h2 id="remote-access-map-title">{{ $t('settings.remoteAccessMapTitle') }}</h2>
        <p>{{ $t('settings.remoteAccessMapHint') }}</p>
      </div>
      <div class="remote-access-map-grid">
        <article class="remote-access-map-item">
          <span class="remote-access-map-kicker">{{ $t('settings.remoteAccessMapServiceKicker') }}</span>
          <strong>{{ $t('settings.remoteAccessMapServiceTitle') }}</strong>
          <p>{{ $t('settings.remoteAccessMapServiceDescription') }}</p>
        </article>
        <article class="remote-access-map-item">
          <span class="remote-access-map-kicker">{{ $t('settings.remoteAccessMapWebKicker') }}</span>
          <strong>{{ $t('settings.remoteAccessMapWebTitle') }}</strong>
          <p>{{ $t('settings.remoteAccessMapWebDescription') }}</p>
        </article>
        <article class="remote-access-map-item">
          <span class="remote-access-map-kicker">{{ $t('settings.remoteAccessMapDesktopKicker') }}</span>
          <strong>{{ $t('settings.remoteAccessMapDesktopTitle') }}</strong>
          <p>{{ $t('settings.remoteAccessMapDesktopDescription') }}</p>
        </article>
      </div>
    </section>

    <RemoteServiceSettingsSection
      ref="remoteServiceSectionRef"
      :active="deferredSections.remoteService"
      :loading="remoteServiceLoading"
      :state="remoteServiceState"
      :has-env-overrides="hasRemoteServiceEnvOverrides"
      :env-override-fields="remoteServiceEnvOverrideFields"
      :form="remoteServiceForm"
      :can-submit="canSubmitRemoteServiceForm"
      :saving="savingRemoteService"
      :copying-token="copyingRemoteServiceToken"
      :regenerating-token="regeneratingRemoteServiceToken"
      :resetting-token="resettingRemoteServiceToken"
      :format-token-source="formatTokenSource"
      @activate="activateDeferredSection('remoteService')"
      @save="handleSaveRemoteService"
      @reset-form="handleResetRemoteServiceForm"
      @reset-token="handleResetRemoteServiceToken"
      @copy-token="handleCopyRemoteServiceToken"
      @regenerate-token="handleRegenerateRemoteServiceToken"
    />

    <CloudflareTunnelSettingsSection
      ref="cloudflareSectionRef"
      :active="deferredSections.cloudflare"
      :loading="cloudflareTunnelLoading"
      :state="cloudflareTunnelState"
      :binary-path="cloudflareBinaryPathInput"
      :can-start="canStartCloudflareTunnel"
      :show-remote-service-warning="!!remoteServiceState && !remoteServiceState.running"
      :saving-config="savingCloudflareTunnelConfig"
      :starting="startingCloudflareTunnel"
      :stopping="stoppingCloudflareTunnel"
      :copying-url="copyingCloudflareTunnelUrl"
      :format-path-source="formatCloudflarePathSource"
      @activate="activateDeferredSection('cloudflare')"
      @update:binary-path="cloudflareBinaryPathInput = $event"
      @save-config="handleSaveCloudflareTunnelConfig"
      @start="handleStartCloudflareTunnel"
      @stop="handleStopCloudflareTunnel"
      @copy-url="handleCopyCloudflareTunnelUrl"
    />

    <RemoteInstancesSettingsSection
      ref="remoteInstancesSectionRef"
      :active="deferredSections.remoteInstances"
      :desktop-remote-mount-enabled="settingsStore.settings.desktopRemoteMountEnabled"
      :instances="instancesStore.remoteInstances"
      :online-count="instancesStore.onlineRemoteCount"
      :form="remoteForm"
      :is-editing="isEditingRemote"
      :can-submit="canSubmitRemoteForm"
      :saving="savingRemote"
      :busy-instance-ids="busyInstanceIds"
      :format-status-text="formatStatusText"
      :format-latency-label="formatLatencyLabel"
      :format-last-checked="formatLastChecked"
      @activate="activateDeferredSection('remoteInstances')"
      @toggle-desktop-remote-mount="handleRemoteFeatureToggle"
      @save="handleSaveRemoteInstance"
      @cancel-edit="resetRemoteForm"
      @edit-instance="handleEditRemoteInstance"
      @delete-instance="handleDeleteRemoteInstance"
    />
    </div>

    <div v-show="shouldShowSettingsSection('terminal')" class="settings-section-group">
      <TerminalSettingsSection
        :buffer-size="settingsStore.settings.bufferSize"
        :terminal-font="settingsStore.settings.terminalFont"
        @update:buffer-size="settingsStore.settings.bufferSize = $event; handleSave()"
        @update:terminal-font="settingsStore.settings.terminalFont = $event; handleSave()"
      />
    </div>

    <div v-show="shouldShowSettingsSection('about')" class="settings-section-group">
      <AboutSettingsSection
        :version="appStore.version || '-'"
        :electron-version="systemInfo.electronVersion || '-'"
        :node-version="systemInfo.nodeVersion || '-'"
        :platform="systemInfo.platform"
        :arch="systemInfo.arch"
      />
    </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import AboutSettingsSection from '@/components/settings/AboutSettingsSection.vue'
import CliPathsSettingsSection from '@/components/settings/CliPathsSettingsSection.vue'
import CloudflareTunnelSettingsSection from '@/components/settings/CloudflareTunnelSettingsSection.vue'
import GeneralPreferencesSettingsSection from '@/components/settings/GeneralPreferencesSettingsSection.vue'
import RemoteServiceSettingsSection from '@/components/settings/RemoteServiceSettingsSection.vue'
import RemoteInstancesSettingsSection from '@/components/settings/RemoteInstancesSettingsSection.vue'
import TerminalSettingsSection from '@/components/settings/TerminalSettingsSection.vue'
import UiIcon from '@/components/ui/UiIcon.vue'
import { useSettingsStore } from '@/stores/settings'
import { useAppStore } from '@/stores/app'
import { useInstancesStore } from '@/stores/instances'
import { useProjectsStore } from '@/stores/projects'
import { useSessionsStore } from '@/stores/sessions'
import { useWorkspaceStore } from '@/stores/workspace'
import { useConfirmDialog } from '@/composables/useConfirmDialog'
import { useToast } from '@/composables/useToast'
import {
  useSettingsPageRuntime
} from '@/composables/useSettingsPageRuntime'
import { formatRemoteOperationError } from '@/utils/remote-operation-error'
import { useI18n } from 'vue-i18n'
import type { RemoteInstanceDraft } from '@/api/remote-instance'
import {
  getCloudflareTunnelState,
  startCloudflareTunnel,
  stopCloudflareTunnel,
  updateCloudflareTunnelConfig,
  type CloudflareTunnelState
} from '@/api/cloudflare-tunnel'
import {
  getRemoteServiceState,
  getRemoteServiceToken,
  regenerateRemoteServiceDefaultToken,
  updateRemoteServiceSettings,
  type RemoteServiceState,
  type RemoteServiceTokenMode
} from '@/api/remote-service'
import { LOCAL_INSTANCE_ID, type RemoteInstance } from '@/models/unified-resource'

interface RemoteFormState {
  id: string | null
  name: string
  baseUrl: string
  token: string
  enabled: boolean
}

interface RemoteServiceFormState {
  enabled: boolean
  host: string
  port: number
  passthroughOnly: boolean
  tokenMode: RemoteServiceTokenMode
  customToken: string
}

type SettingsCategory = 'all' | 'general' | 'cli' | 'terminal' | 'remote' | 'about'

type SettingsSectionMeta = {
  id: Exclude<SettingsCategory, 'all'>
  category: SettingsCategory
  label: string
  keywords: string[]
}

const { t } = useI18n()
const route = useRoute()
const settingsStore = useSettingsStore()
const appStore = useAppStore()
const instancesStore = useInstancesStore()
const projectsStore = useProjectsStore()
const sessionsStore = useSessionsStore()
const workspaceStore = useWorkspaceStore()
const confirmDialog = useConfirmDialog()
const toast = useToast()

const savingRemote = ref(false)
const savingRemoteService = ref(false)
const savingCloudflareTunnelConfig = ref(false)
const startingCloudflareTunnel = ref(false)
const stoppingCloudflareTunnel = ref(false)
const copyingCloudflareTunnelUrl = ref(false)
const cloudflareTunnelLoading = ref(false)
const copyingRemoteServiceToken = ref(false)
const regeneratingRemoteServiceToken = ref(false)
const resettingRemoteServiceToken = ref(false)
const remoteServiceLoading = ref(false)
const deletingId = ref<string | null>(null)
const remoteServiceState = ref<RemoteServiceState | null>(null)
const cloudflareTunnelState = ref<CloudflareTunnelState | null>(null)
const cloudflareBinaryPathInput = ref('')
const remoteForm = reactive<RemoteFormState>({
  id: null,
  name: '',
  baseUrl: '',
  token: '',
  enabled: true
})
const remoteServiceForm = reactive<RemoteServiceFormState>({
  enabled: false,
  host: '127.0.0.1',
  port: 18765,
  passthroughOnly: true,
  tokenMode: 'default',
  customToken: ''
})
const activeSettingsCategory = ref<SettingsCategory>('all')
const settingsSearchQuery = ref('')

const {
  systemInfo,
  deferredSections,
  remoteServiceSectionRef,
  cloudflareSectionRef,
  remoteInstancesSectionRef,
  activateDeferredSection,
  flushSettingsSave,
  scheduleSettingsSave
} = useSettingsPageRuntime({
  loadDeferredSection: (section) => {
    if (section === 'remoteService') {
      return loadRemoteServiceState()
    }
    if (section === 'cloudflare') {
      return loadCloudflareTunnelState()
    }
    return loadRemoteInstances()
  },
  refreshDeferredSection: (section) => {
    if (section === 'remoteService') {
      return loadRemoteServiceState()
    }
    if (section === 'cloudflare') {
      return loadCloudflareTunnelState()
    }
    return loadRemoteInstances()
  },
  onSaveSettings: () => settingsStore.save(),
  onSaveSuccess: () => toast.success(t('toast.settingsSaved')),
  onSaveError: () => toast.error(t('toast.settingsSaveFail'))
})

const isEditingRemote = computed(() => !!remoteForm.id)
const canSubmitRemoteForm = computed(() => {
  return !!remoteForm.name.trim() && !!remoteForm.baseUrl.trim() && !!remoteForm.token.trim()
})
const canSubmitRemoteServiceForm = computed(() => {
  if (!remoteServiceForm.host.trim()) return false
  if (!Number.isFinite(remoteServiceForm.port) || remoteServiceForm.port < 1 || remoteServiceForm.port > 65535) {
    return false
  }
  if (remoteServiceForm.tokenMode !== 'custom') return true
  const token = remoteServiceForm.customToken.trim()
  if (token.length >= 64) return true
  return remoteServiceState.value?.customTokenConfigured === true
})
const busyInstanceIds = computed(() => {
  const ids: string[] = []
  if (deletingId.value) ids.push(deletingId.value)
  return ids
})
const hasRemoteServiceEnvOverrides = computed(() => {
  const overrides = remoteServiceState.value?.envOverrides
  return !!overrides && Object.values(overrides).some(Boolean)
})
const remoteServiceEnvOverrideFields = computed(() => {
  const overrides = remoteServiceState.value?.envOverrides
  if (!overrides) return '-'
  const fields: string[] = []
  if (overrides.enabled) fields.push(t('settings.remoteServiceFieldEnabled'))
  if (overrides.host) fields.push(t('settings.remoteServiceFieldHost'))
  if (overrides.port) fields.push(t('settings.remoteServiceFieldPort'))
  if (overrides.passthroughOnly) fields.push(t('settings.remoteServiceFieldPassthroughOnly'))
  if (overrides.token) fields.push(t('settings.remoteServiceFieldToken'))
  return fields.join('、') || '-'
})
const canStartCloudflareTunnel = computed(() => {
  return !!cloudflareTunnelState.value?.available && !!remoteServiceState.value?.running
})

const remoteWorkspaceTabCount = computed(() =>
  Object.values(workspaceStore.layout.tabs).filter((tab) => tab.instanceId !== LOCAL_INSTANCE_ID).length
)

const remoteSessionCount = computed(() =>
  sessionsStore.unifiedSessions.filter((session) => session.instanceId !== LOCAL_INSTANCE_ID).length
)

const settingsSections = computed<SettingsSectionMeta[]>(() => [
  {
    id: 'general',
    category: 'general',
    label: t('settings.navGeneral'),
    keywords: [
      t('settings.appearance'),
      t('settings.language'),
      t('settings.sessions'),
      t('settings.theme'),
      t('settings.themeChatGPTDark'),
      t('settings.themeGeminiDark'),
      t('settings.sessionWakeConfirm'),
      t('settings.sessionsListPosition'),
      t('settings.smartPriorityEnabled')
    ]
  },
  {
    id: 'cli',
    category: 'cli',
    label: t('settings.navCli'),
    keywords: [
      t('settings.cliPaths'),
      t('settings.claudePath'),
      t('settings.codexPath'),
      t('settings.opencodePath'),
      'Claude',
      'Codex',
      'OpenCode'
    ]
  },
  {
    id: 'terminal',
    category: 'terminal',
    label: t('settings.navTerminal'),
    keywords: [
      t('settings.terminal'),
      t('settings.bufferSize'),
      t('settings.terminalFont')
    ]
  },
  {
    id: 'remote',
    category: 'remote',
    label: t('settings.navRemote'),
    keywords: [
      t('settings.localRemoteService'),
      t('settings.remoteInstances'),
      t('settings.cloudflareTunnel'),
      t('settings.desktopRemoteMountEnabled'),
      t('settings.remoteServiceTokenMode'),
      'Cloudflare',
      'Tunnel',
      'Token'
    ]
  },
  {
    id: 'about',
    category: 'about',
    label: t('settings.navAbout'),
    keywords: [
      t('settings.about'),
      t('settings.version'),
      t('settings.system')
    ]
  }
])

const normalizedSettingsSearchQuery = computed(() => settingsSearchQuery.value.trim().toLocaleLowerCase())

const visibleSettingsSections = computed(() => {
  const query = normalizedSettingsSearchQuery.value
  return settingsSections.value.filter((section) => {
    if (activeSettingsCategory.value !== 'all' && section.category !== activeSettingsCategory.value) {
      return false
    }
    if (!query) return true

    const haystack = [section.label, ...section.keywords].join(' ').toLocaleLowerCase()
    return haystack.includes(query)
  })
})

const visibleSettingsSectionIds = computed(() => new Set(visibleSettingsSections.value.map((section) => section.id)))
const hasVisibleSettingsSections = computed(() => visibleSettingsSections.value.length > 0)

const settingsNavItems = computed(() => {
  const categories: Array<{ id: SettingsCategory; marker: string; label: string }> = [
    { id: 'all', marker: '*', label: t('settings.navAll') },
    { id: 'general', marker: 'G', label: t('settings.navGeneral') },
    { id: 'cli', marker: 'C', label: t('settings.navCli') },
    { id: 'terminal', marker: 'T', label: t('settings.navTerminal') },
    { id: 'remote', marker: 'R', label: t('settings.navRemote') },
    { id: 'about', marker: 'I', label: t('settings.navAbout') }
  ]

  return categories.map((item) => {
    const count = item.id === 'all'
      ? settingsSections.value.length
      : settingsSections.value.filter((section) => section.category === item.id).length
    return {
      ...item,
      countLabel: t('settings.sectionItemCount', { count })
    }
  })
})

function shouldShowSettingsSection(section: SettingsSectionMeta['id']): boolean {
  return visibleSettingsSectionIds.value.has(section)
}

function setSettingsCategory(category: SettingsCategory): void {
  activeSettingsCategory.value = category
  if (category === 'remote') {
    activateRemoteSettingsSections()
  }
}

function normalizeRouteSettingsCategory(value: unknown): SettingsCategory | null {
  const category = Array.isArray(value) ? value[0] : value
  if (category === 'all' || category === 'general' || category === 'cli' || category === 'terminal' || category === 'remote' || category === 'about') {
    return category
  }
  return null
}

watch(
  () => route.query.category,
  (value) => {
    const category = normalizeRouteSettingsCategory(value)
    if (!category) return
    settingsSearchQuery.value = ''
    setSettingsCategory(category)
  },
  { immediate: true }
)

function activateRemoteSettingsSections(): void {
  activateDeferredSection('remoteService')
  activateDeferredSection('cloudflare')
  activateDeferredSection('remoteInstances')
}

function normalizeBaseUrl(value: string): string {
  return value.trim().replace(/\/+$/, '')
}

function resetRemoteForm(): void {
  remoteForm.id = null
  remoteForm.name = ''
  remoteForm.baseUrl = ''
  remoteForm.token = ''
  remoteForm.enabled = true
}

function syncRemoteServiceForm(state: RemoteServiceState): void {
  remoteServiceForm.enabled = state.configuredEnabled
  remoteServiceForm.host = state.host
  remoteServiceForm.port = state.port
  remoteServiceForm.passthroughOnly = state.passthroughOnly
  remoteServiceForm.tokenMode = state.tokenMode
  remoteServiceForm.customToken = ''
}

function handleResetRemoteServiceForm(): void {
  if (!remoteServiceState.value) return
  syncRemoteServiceForm(remoteServiceState.value)
}

function formatStatusText(status: RemoteInstance['status']): string {
  return t(`settings.remoteStatus.${status}`)
}

function formatTokenSource(source: RemoteServiceState['tokenSource']): string {
  return t(`settings.remoteServiceTokenSourceValue.${source}`)
}

function formatCloudflarePathSource(source: CloudflareTunnelState['pathSource']): string {
  return t(`settings.cloudflareTunnelPathSourceValue.${source}`)
}

function formatLatencyLabel(
  latencyMs: number | null,
  status: RemoteInstance['status'] | null = null
): string {
  if (latencyMs === null || !Number.isFinite(latencyMs)) {
    if (status === 'offline' || status === 'error') {
      return t('settings.remoteLatencyUnavailable')
    }
    if (status === 'connecting') {
      return t('settings.remoteStatus.connecting')
    }
    return t('settings.remoteLatencyUnknown')
  }
  const rounded = Math.round(latencyMs)
  const grade = rounded <= 120
    ? t('settings.remoteLatencyFast')
    : rounded <= 300
      ? t('settings.remoteLatencyNormal')
      : t('settings.remoteLatencySlow')
  return `${grade} · ${rounded}ms`
}

function formatLastChecked(timestamp: number | null): string {
  if (!timestamp) return t('settings.remoteNeverChecked')
  return new Date(timestamp).toLocaleString()
}

function handleSave(showToast = false): void {
  scheduleSettingsSave(showToast)
}

async function loadRemoteInstances(): Promise<void> {
  if (!settingsStore.settings.desktopRemoteMountEnabled) {
    instancesStore.clearRemoteState()
    return
  }
  try {
    await instancesStore.fetchInstances()
  } catch (error) {
    toast.error(t('toast.operationFailed') + ': ' + (error instanceof Error ? error.message : String(error)))
  }
}

async function loadRemoteServiceState(): Promise<void> {
  remoteServiceLoading.value = true
  try {
    const state = await getRemoteServiceState()
    remoteServiceState.value = state
    syncRemoteServiceForm(state)
  } catch (error) {
    toast.error(t('toast.operationFailed') + ': ' + (error instanceof Error ? error.message : String(error)))
  } finally {
    remoteServiceLoading.value = false
  }
}

async function loadCloudflareTunnelState(): Promise<void> {
  cloudflareTunnelLoading.value = true
  try {
    const state = await getCloudflareTunnelState()
    cloudflareTunnelState.value = state
    cloudflareBinaryPathInput.value = state.binaryPath || ''
  } catch (error) {
    toast.error(t('toast.operationFailed') + ': ' + (error instanceof Error ? error.message : String(error)))
  } finally {
    cloudflareTunnelLoading.value = false
  }
}

function toggleSessionsListPosition(): void {
  settingsStore.settings.sessionsListPosition = settingsStore.settings.sessionsListPosition === 'left' ? 'top' : 'left'
  handleSave()
}

async function handleSaveRemoteService(): Promise<void> {
  if (!canSubmitRemoteServiceForm.value) return
  savingRemoteService.value = true
  try {
    const state = await updateRemoteServiceSettings({
      enabled: remoteServiceForm.enabled,
      host: remoteServiceForm.host.trim(),
      port: remoteServiceForm.port,
      passthroughOnly: remoteServiceForm.passthroughOnly,
      tokenMode: remoteServiceForm.tokenMode,
      customToken:
        remoteServiceForm.tokenMode === 'custom'
          ? remoteServiceForm.customToken.trim() || undefined
          : null
    })
    remoteServiceState.value = state
    syncRemoteServiceForm(state)
    await loadCloudflareTunnelState()
    toast.success(t('toast.settingsSaved'))
  } catch (error) {
    toast.error(t('toast.operationFailed') + ': ' + (error instanceof Error ? error.message : String(error)))
  } finally {
    savingRemoteService.value = false
  }
}

async function handleCopyRemoteServiceToken(): Promise<void> {
  copyingRemoteServiceToken.value = true
  try {
    const token = await getRemoteServiceToken()
    await navigator.clipboard.writeText(token)
    toast.success(t('settings.remoteServiceTokenCopied'))
  } catch (error) {
    toast.error(t('toast.operationFailed') + ': ' + (error instanceof Error ? error.message : String(error)))
  } finally {
    copyingRemoteServiceToken.value = false
  }
}

async function handleRegenerateRemoteServiceToken(): Promise<void> {
  const confirmed = await confirmDialog.confirm({
    title: t('settings.remoteServiceRegenerateTokenConfirmTitle'),
    message: t('settings.remoteServiceRegenerateTokenConfirmMessage'),
    details: t('settings.remoteServiceRegenerateTokenConfirmDetails'),
    confirmText: t('settings.remoteServiceRegenerateDefaultToken'),
    cancelText: t('confirm.cancel'),
    tone: 'danger'
  })
  if (!confirmed) return

  regeneratingRemoteServiceToken.value = true
  try {
    const state = await regenerateRemoteServiceDefaultToken()
    remoteServiceState.value = state
    syncRemoteServiceForm(state)
    await loadCloudflareTunnelState()
    toast.success(t('settings.remoteServiceDefaultTokenRegenerated'))
  } catch (error) {
    toast.error(t('toast.operationFailed') + ': ' + (error instanceof Error ? error.message : String(error)))
  } finally {
    regeneratingRemoteServiceToken.value = false
  }
}

async function handleResetRemoteServiceToken(): Promise<void> {
  if (!remoteServiceState.value?.customTokenConfigured) return
  const confirmed = await confirmDialog.confirm({
    title: t('settings.remoteServiceResetTokenConfirmTitle'),
    message: t('settings.remoteServiceResetTokenConfirmMessage'),
    details: t('settings.remoteServiceResetTokenConfirmDetails'),
    confirmText: t('settings.remoteServiceResetToDefaultToken'),
    cancelText: t('confirm.cancel'),
    tone: 'danger'
  })
  if (!confirmed) return

  resettingRemoteServiceToken.value = true
  try {
    const state = await updateRemoteServiceSettings({
      enabled: remoteServiceForm.enabled,
      host: remoteServiceForm.host.trim(),
      port: remoteServiceForm.port,
      passthroughOnly: remoteServiceForm.passthroughOnly,
      tokenMode: 'default',
      customToken: null
    })
    remoteServiceState.value = state
    syncRemoteServiceForm(state)
    await loadCloudflareTunnelState()
    toast.success(t('settings.remoteServiceTokenResetToDefaultSuccess'))
  } catch (error) {
    toast.error(t('toast.operationFailed') + ': ' + (error instanceof Error ? error.message : String(error)))
  } finally {
    resettingRemoteServiceToken.value = false
  }
}

async function handleSaveCloudflareTunnelConfig(): Promise<void> {
  savingCloudflareTunnelConfig.value = true
  try {
    const state = await updateCloudflareTunnelConfig(cloudflareBinaryPathInput.value.trim() || null)
    cloudflareTunnelState.value = state
    cloudflareBinaryPathInput.value = state.binaryPath || ''
    toast.success(t('toast.settingsSaved'))
  } catch (error) {
    toast.error(t('toast.operationFailed') + ': ' + (error instanceof Error ? error.message : String(error)))
  } finally {
    savingCloudflareTunnelConfig.value = false
  }
}

async function handleStartCloudflareTunnel(): Promise<void> {
  startingCloudflareTunnel.value = true
  try {
    const state = await startCloudflareTunnel()
    cloudflareTunnelState.value = state
    cloudflareBinaryPathInput.value = state.binaryPath || ''
    toast.success(t('settings.cloudflareTunnelStarted'))
  } catch (error) {
    await loadCloudflareTunnelState()
    toast.error(t('settings.cloudflareTunnelStartFailed') + ': ' + (error instanceof Error ? error.message : String(error)))
  } finally {
    startingCloudflareTunnel.value = false
  }
}

async function handleStopCloudflareTunnel(): Promise<void> {
  stoppingCloudflareTunnel.value = true
  try {
    const state = await stopCloudflareTunnel()
    cloudflareTunnelState.value = state
    toast.success(t('settings.cloudflareTunnelStoppedToast'))
  } catch (error) {
    toast.error(t('toast.operationFailed') + ': ' + (error instanceof Error ? error.message : String(error)))
  } finally {
    stoppingCloudflareTunnel.value = false
  }
}

async function handleCopyCloudflareTunnelUrl(): Promise<void> {
  if (!cloudflareTunnelState.value?.publicUrl) return
  copyingCloudflareTunnelUrl.value = true
  try {
    await navigator.clipboard.writeText(cloudflareTunnelState.value.publicUrl)
    toast.success(t('settings.cloudflareTunnelUrlCopied'))
  } catch (error) {
    toast.error(t('toast.operationFailed') + ': ' + (error instanceof Error ? error.message : String(error)))
  } finally {
    copyingCloudflareTunnelUrl.value = false
  }
}

async function handleRemoteFeatureToggle(nextEnabled?: boolean): Promise<void> {
  const previousEnabled = settingsStore.settings.desktopRemoteMountEnabled
  const enabled = typeof nextEnabled === 'boolean' ? nextEnabled : previousEnabled
  if (previousEnabled && !enabled) {
    const confirmed = await confirmDialog.confirm({
      title: t('settings.desktopRemoteMountDisableConfirmTitle'),
      message: t('settings.desktopRemoteMountDisableConfirmMessage', {
        tabs: remoteWorkspaceTabCount.value,
        sessions: remoteSessionCount.value
      }),
      details: t('settings.desktopRemoteMountDisableConfirmDetails'),
      confirmText: t('settings.desktopRemoteMountDisableConfirmAction'),
      cancelText: t('confirm.cancel'),
      tone: 'danger'
    })
    if (!confirmed) return
  }
  settingsStore.settings.desktopRemoteMountEnabled = enabled
  try {
    await flushSettingsSave(false)
    if (!enabled) {
      resetRemoteForm()
      instancesStore.clearRemoteState()
      projectsStore.clearRemoteProjects()
      sessionsStore.clearRemoteSessions()
    } else {
      await loadRemoteInstances()
    }
    toast.success(t('toast.settingsSaved'))
  } catch (error) {
    settingsStore.settings.desktopRemoteMountEnabled = previousEnabled
    toast.error(t('toast.operationFailed') + ': ' + (error instanceof Error ? error.message : String(error)))
  }
}

function buildRemoteDraft(): RemoteInstanceDraft {
  return {
    name: remoteForm.name.trim(),
    baseUrl: normalizeBaseUrl(remoteForm.baseUrl),
    token: remoteForm.token.trim(),
    enabled: remoteForm.enabled
  }
}

function findRemoteInstanceName(id: string): string {
  return instancesStore.getInstance(id)?.name || id
}

function formatRemoteSettingsError(error: unknown, params: {
  instanceId?: string | null
  instanceName?: string | null
  action: string
  target: string
}): string {
  const virtualInstanceId = params.instanceId || '__remote-settings__'
  return formatRemoteOperationError({
    t,
    instancesStore: {
      getInstance(id: string) {
        if (id === virtualInstanceId) {
          return {
            id,
            type: 'remote',
            name: params.instanceName || params.target,
            baseUrl: '',
            enabled: true,
            authRef: '',
            status: 'unknown',
            lastCheckedAt: null,
            passthroughOnly: false,
            capabilities: instancesStore.localInstance.capabilities,
            lastError: null,
            latencyMs: null
          }
        }
        return instancesStore.getInstance(id)
      }
    },
    instanceId: virtualInstanceId,
    action: params.action,
    target: params.target,
    error
  })
}

async function handleSaveRemoteInstance(): Promise<void> {
  if (!canSubmitRemoteForm.value) return
  savingRemote.value = true
  const targetName = remoteForm.name.trim() || remoteForm.id || t('settings.remoteInstances')
  try {
    const draft = buildRemoteDraft()
    if (remoteForm.id) {
      await instancesStore.updateRemoteInstance(remoteForm.id, draft)
      toast.success(t('settings.remoteUpdated'))
    } else {
      await instancesStore.addRemoteInstance(draft)
      toast.success(t('settings.remoteAdded'))
    }
    resetRemoteForm()
    await loadRemoteInstances()
  } catch (error) {
    toast.error(formatRemoteSettingsError(error, {
      instanceId: remoteForm.id,
      instanceName: targetName,
      action: remoteForm.id ? t('settings.remoteUpdated') : t('settings.remoteAdded'),
      target: targetName
    }))
  } finally {
    savingRemote.value = false
  }
}

async function handleEditRemoteInstance(instance: RemoteInstance): Promise<void> {
  try {
    const token = (await instancesStore.getRemoteToken(instance.id)) || ''
    remoteForm.id = instance.id
    remoteForm.name = instance.name
    remoteForm.baseUrl = instance.baseUrl
    remoteForm.token = token
    remoteForm.enabled = instance.enabled
  } catch (error) {
    toast.error(formatRemoteSettingsError(error, {
      instanceId: instance.id,
      instanceName: instance.name,
      action: t('settings.remoteServiceCopyToken'),
      target: instance.name
    }))
  }
}

async function handleDeleteRemoteInstance(id: string): Promise<void> {
  const targetName = findRemoteInstanceName(id)
  const confirmed = await confirmDialog.confirm({
    title: t('settings.remoteDeleteConfirmTitle'),
    message: t('settings.remoteDeleteConfirmMessage'),
    details: t('settings.remoteDeleteConfirmDetails'),
    confirmText: t('confirm.delete'),
    cancelText: t('confirm.cancel'),
    tone: 'danger'
  })
  if (!confirmed) return
  deletingId.value = id
  try {
    await instancesStore.removeRemoteInstance(id)
    if (remoteForm.id === id) {
      resetRemoteForm()
    }
    toast.success(t('settings.remoteDeleted'))
  } catch (error) {
    toast.error(formatRemoteSettingsError(error, {
      instanceId: id,
      instanceName: targetName,
      action: t('confirm.delete'),
      target: targetName
    }))
  } finally {
    deletingId.value = null
  }
}

onMounted(async () => {
  if (!settingsStore.loaded) {
    await settingsStore.load()
  }
})

</script>

<style scoped lang="scss">
.settings-page {
  padding: var(--spacing-xl);
  max-width: 1220px;
  overflow-y: auto;
  min-height: 100%;

  h1 {
    font-size: var(--font-size-2xl);
    margin: 0;
  }
}

.settings-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--spacing-lg);
  margin-bottom: var(--spacing-lg);
}

.settings-title-block {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;

  p {
    margin: 0;
    color: var(--text-muted);
    font-size: var(--font-size-sm);
  }
}

.settings-search {
  position: relative;
  flex: 0 1 320px;
  min-width: 220px;

  .ui-icon {
    position: absolute;
    top: 50%;
    left: 10px;
    width: 15px;
    height: 15px;
    transform: translateY(-50%);
    color: var(--text-muted);
    pointer-events: none;
  }

  input {
    width: 100%;
    height: 34px;
    padding: 0 10px 0 32px;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
    background: var(--bg-card);
    color: var(--text-primary);
    font-size: var(--font-size-sm);

    &:focus {
      outline: none;
      border-color: var(--accent-primary);
    }
  }
}

.settings-shell {
  display: grid;
  grid-template-columns: 190px minmax(0, 1fr);
  align-items: start;
  gap: var(--spacing-lg);
}

.settings-nav {
  position: sticky;
  top: var(--spacing-md);
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  background: var(--bg-secondary);
}

.settings-nav-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-height: 38px;
  padding: 6px 8px;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  text-align: left;
  transition:
    background var(--transition-fast),
    border-color var(--transition-fast),
    color var(--transition-fast);

  &:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  &.active {
    border-color: color-mix(in srgb, var(--accent-primary) 44%, var(--border-color));
    background: color-mix(in srgb, var(--accent-primary) 9%, var(--bg-card));
    color: var(--text-primary);
  }
}

.settings-nav-marker {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 22px;
  height: 22px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-xs);
  background: var(--bg-primary);
  color: var(--text-muted);
  font-size: 10px;
  font-weight: 800;
  line-height: 1;
}

.settings-nav-copy {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.settings-nav-label,
.settings-nav-count {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.settings-nav-label {
  color: currentColor;
  font-size: 12px;
  font-weight: 700;
}

.settings-nav-count {
  color: var(--text-muted);
  font-size: 10px;
}

.settings-content {
  min-width: 0;
}

.settings-section-group {
  display: block;
}

.settings-empty-state {
  padding: var(--spacing-lg);
  border: 1px dashed var(--border-color);
  border-radius: var(--radius-md);
  background: var(--bg-card);
  color: var(--text-muted);
  font-size: var(--font-size-sm);
}

.settings-remote-stack {
  display: contents;
}

.remote-access-map {
  margin-bottom: var(--spacing-lg);
  padding: var(--spacing-lg);
  border: 1px solid color-mix(in srgb, var(--accent-primary) 22%, var(--border-color));
  border-radius: var(--radius-md);
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--accent-primary) 7%, transparent), transparent),
    var(--bg-card);
}

.remote-access-map-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--spacing-lg);
  margin-bottom: var(--spacing-md);

  h2 {
    margin: 0;
    color: var(--text-primary);
    font-size: var(--font-size-lg);
  }

  p {
    max-width: 560px;
    margin: 0;
    color: var(--text-muted);
    font-size: var(--font-size-sm);
    line-height: 1.6;
  }
}

.remote-access-map-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.remote-access-map-item {
  display: flex;
  flex-direction: column;
  gap: 7px;
  min-width: 0;
  padding: 12px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  background: var(--bg-secondary);

  strong {
    color: var(--text-primary);
    font-size: var(--font-size-sm);
  }

  p {
    margin: 0;
    color: var(--text-muted);
    font-size: var(--font-size-xs);
    line-height: 1.55;
  }
}

.remote-access-map-kicker {
  color: var(--accent-primary);
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0;
  text-transform: uppercase;
}

.settings-section {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  padding: var(--spacing-lg);
  margin-bottom: var(--spacing-lg);

  h2 {
    font-size: var(--font-size-lg);
    margin-bottom: var(--spacing-md);
    color: var(--text-secondary);
  }
}

.section-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: var(--spacing-md);
  margin-bottom: var(--spacing-md);
}

.section-hint {
  margin: 4px 0 0;
}

.instance-summary {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.summary-pill {
  display: inline-flex;
  align-items: center;
  padding: 6px 10px;
  border-radius: var(--radius-sm);
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  color: var(--text-secondary);
  font-size: var(--font-size-xs);
}

.summary-pill.online {
  color: var(--accent-primary);
  border-color: color-mix(in srgb, var(--accent-primary) 35%, var(--border-color));
}

.setting-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-md);
  padding: 10px 0;

  & + .setting-row {
    border-top: 1px solid color-mix(in srgb, var(--border-color) 62%, transparent);
  }

  label {
    font-size: var(--font-size-md);
    color: var(--text-primary);
  }

  select,
  input {
    background: var(--bg-primary);
    color: var(--text-primary);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
    padding: var(--spacing-xs) var(--spacing-sm);
    font-size: var(--font-size-sm);
    min-width: 200px;

    &:focus {
      outline: none;
      border-color: var(--accent-primary);
    }

    &:disabled {
      opacity: 0.5;
    }
  }

  input[type='number'] {
    width: 120px;
    min-width: auto;
  }

  input[type='checkbox'] {
    width: 18px;
    min-width: auto;
    height: 18px;
    padding: 0;
    accent-color: var(--accent-primary);
  }
}

.setting-row-stack {
  align-items: flex-start;
}

.setting-label-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.remote-toggle-row {
  margin-bottom: var(--spacing-md);
}

.remote-disabled-state {
  padding: var(--spacing-md);
  border: 1px dashed var(--border-color);
  border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--accent-primary) 6%, transparent);
  color: var(--text-secondary);
  line-height: 1.6;
}

.remote-form-panel {
  background: linear-gradient(180deg, color-mix(in srgb, var(--accent-primary) 7%, transparent), color-mix(in srgb, var(--accent-primary) 3%, transparent));
  border: 1px solid color-mix(in srgb, var(--accent-primary) 18%, var(--border-color));
  border-radius: var(--radius-md);
  padding: var(--spacing-md);
  margin-bottom: var(--spacing-md);
}

.remote-form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--spacing-md);
}

.field-block {
  display: flex;
  flex-direction: column;
  gap: 6px;

  label {
    font-size: var(--font-size-sm);
    color: var(--text-secondary);
  }

  input,
  select {
    width: 100%;
    background: var(--bg-primary);
    color: var(--text-primary);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
    padding: 10px 12px;
    font-size: var(--font-size-sm);

    &:focus {
      outline: none;
      border-color: var(--accent-primary);
    }
  }
}

.field-block-wide {
  grid-column: 1 / -1;
}

.field-block-inline {
  justify-content: flex-end;
}

.field-block-inline-start {
  justify-content: flex-start;
}

.checkbox-row {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--text-primary);

  input {
    width: 16px;
    height: 16px;
    accent-color: var(--accent-primary);
  }
}

.remote-form-actions {
  display: flex;
  gap: 8px;
  margin-top: var(--spacing-md);
  flex-wrap: wrap;
}

.draft-result {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: var(--spacing-md);
  padding: 10px 12px;
  border-radius: var(--radius-sm);
  font-size: var(--font-size-sm);
}

.draft-result.ok {
  background: color-mix(in srgb, var(--status-success) 11%, transparent);
  border: 1px solid color-mix(in srgb, var(--status-success) 28%, var(--border-color));
}

.draft-result.error {
  background: color-mix(in srgb, var(--status-error) 11%, transparent);
  border: 1px solid color-mix(in srgb, var(--status-error) 28%, var(--border-color));
}

.draft-result-error {
  color: var(--status-error);
}

.inline-hint {
  padding: 0;
}

.remote-service-env-note {
  margin-bottom: var(--spacing-md);
}

.remote-empty-state {
  padding: var(--spacing-lg);
  text-align: center;
  color: var(--text-muted);
  border: 1px dashed var(--border-color);
  border-radius: var(--radius-md);
}

.remote-instance-list {
  display: grid;
  gap: var(--spacing-md);
}

.remote-instance-card {
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  background: var(--bg-primary);
  padding: var(--spacing-md);
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
}

.remote-instance-card.disabled {
  opacity: 0.72;
}

.remote-card-head {
  display: flex;
  justify-content: space-between;
  gap: var(--spacing-md);
  align-items: flex-start;
}

.remote-title-line {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;

  h3 {
    margin: 0;
    font-size: var(--font-size-lg);
    color: var(--text-primary);
  }
}

.remote-card-url {
  margin: 8px 0 0;
  color: var(--text-muted);
  font-size: var(--font-size-sm);
  word-break: break-all;
}

.remote-card-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.status-badge,
.mode-badge {
  display: inline-flex;
  align-items: center;
  padding: 4px 8px;
  border-radius: var(--radius-xs);
  font-size: 11px;
  border: 1px solid transparent;
}

.status-badge.status-online {
  background: color-mix(in srgb, var(--status-success) 12%, transparent);
  color: var(--status-success);
  border-color: color-mix(in srgb, var(--status-success) 28%, var(--border-color));
}

.status-badge.status-offline,
.status-badge.status-error {
  background: color-mix(in srgb, var(--status-error) 12%, transparent);
  color: var(--status-error);
  border-color: color-mix(in srgb, var(--status-error) 28%, var(--border-color));
}

.status-badge.status-connecting,
.status-badge.status-unknown {
  background: color-mix(in srgb, var(--status-warning) 12%, transparent);
  color: var(--status-warning);
  border-color: color-mix(in srgb, var(--status-warning) 28%, var(--border-color));
}

.mode-badge {
  background: color-mix(in srgb, var(--accent-primary) 9%, transparent);
  color: var(--text-secondary);
  border-color: color-mix(in srgb, var(--accent-primary) 22%, var(--border-color));
}

.mode-badge.muted {
  background: color-mix(in srgb, var(--bg-tertiary) 60%, transparent);
  color: var(--text-muted);
  border-color: var(--border-color);
}

.remote-card-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.meta-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 12px;
  background: var(--bg-secondary);
  border-radius: var(--radius-sm);
}

.meta-item-full {
  grid-column: 1 / -1;
}

.meta-label {
  color: var(--text-muted);
  font-size: var(--font-size-xs);
}

.meta-value {
  color: var(--text-primary);
  font-size: var(--font-size-sm);
}

.meta-value.mono,
.about-value {
  font-family: var(--font-mono);
}

.error-text {
  color: var(--status-error);
  word-break: break-word;
}

.setting-hint {
  font-size: var(--font-size-xs);
  color: var(--text-muted);
  padding: 0 0 var(--spacing-xs);
}

.about-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--spacing-sm);
}

.about-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: var(--spacing-sm);
  background: var(--bg-primary);
  border-radius: var(--radius-sm);
}

.about-label {
  font-size: var(--font-size-xs);
  color: var(--text-muted);
}

.about-value {
  font-size: var(--font-size-sm);
}

@media (max-width: 960px) {
  .settings-page {
    max-width: none;
  }

  .settings-header {
    align-items: stretch;
    flex-direction: column;
  }

  .settings-search {
    flex: 1 1 auto;
    min-width: 0;
  }

  .settings-shell {
    grid-template-columns: 1fr;
  }

  .settings-nav {
    position: static;
    flex-direction: row;
    overflow-x: auto;
  }

  .settings-nav-item {
    flex: 0 0 auto;
    width: 152px;
  }

  .remote-access-map-head {
    flex-direction: column;
    gap: var(--spacing-xs);
  }

  .remote-access-map-grid {
    grid-template-columns: 1fr;
  }

  .section-head,
  .remote-card-head,
  .setting-row {
    flex-direction: column;
    align-items: stretch;
  }

  .remote-form-grid,
  .remote-card-grid,
  .about-grid {
    grid-template-columns: 1fr;
  }

  .field-block-wide,
  .meta-item-full {
    grid-column: auto;
  }
}
</style>
