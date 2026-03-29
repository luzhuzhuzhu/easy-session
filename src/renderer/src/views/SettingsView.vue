<template>
  <div class="settings-page">
    <h1>{{ $t('settings.title') }}</h1>

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

    <CliPathsSettingsSection
      :claude-path="settingsStore.settings.claudePath"
      :codex-path="settingsStore.settings.codexPath"
      :opencode-path="settingsStore.settings.opencodePath"
      @update:claude-path="settingsStore.settings.claudePath = $event; handleSave()"
      @update:codex-path="settingsStore.settings.codexPath = $event; handleSave()"
      @update:opencode-path="settingsStore.settings.opencodePath = $event; handleSave()"
    />

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

    <TerminalSettingsSection
      :buffer-size="settingsStore.settings.bufferSize"
      :terminal-font="settingsStore.settings.terminalFont"
      @update:buffer-size="settingsStore.settings.bufferSize = $event; handleSave()"
      @update:terminal-font="settingsStore.settings.terminalFont = $event; handleSave()"
    />

    <AboutSettingsSection
      :version="appStore.version || '-'"
      :electron-version="systemInfo.electronVersion || '-'"
      :node-version="systemInfo.nodeVersion || '-'"
      :platform="systemInfo.platform"
      :arch="systemInfo.arch"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import AboutSettingsSection from '@/components/settings/AboutSettingsSection.vue'
import CliPathsSettingsSection from '@/components/settings/CliPathsSettingsSection.vue'
import CloudflareTunnelSettingsSection from '@/components/settings/CloudflareTunnelSettingsSection.vue'
import GeneralPreferencesSettingsSection from '@/components/settings/GeneralPreferencesSettingsSection.vue'
import RemoteServiceSettingsSection from '@/components/settings/RemoteServiceSettingsSection.vue'
import RemoteInstancesSettingsSection from '@/components/settings/RemoteInstancesSettingsSection.vue'
import TerminalSettingsSection from '@/components/settings/TerminalSettingsSection.vue'
import { useSettingsStore } from '@/stores/settings'
import { useAppStore } from '@/stores/app'
import { useInstancesStore } from '@/stores/instances'
import { useProjectsStore } from '@/stores/projects'
import { useSessionsStore } from '@/stores/sessions'
import { useToast } from '@/composables/useToast'
import {
  useSettingsPageRuntime
} from '@/composables/useSettingsPageRuntime'
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
import type { RemoteInstance } from '@/models/unified-resource'

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

const { t } = useI18n()
const settingsStore = useSettingsStore()
const appStore = useAppStore()
const instancesStore = useInstancesStore()
const projectsStore = useProjectsStore()
const sessionsStore = useSessionsStore()
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

async function handleSaveRemoteInstance(): Promise<void> {
  if (!canSubmitRemoteForm.value) return
  savingRemote.value = true
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
    toast.error(t('toast.operationFailed') + ': ' + (error instanceof Error ? error.message : String(error)))
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
    toast.error(t('toast.operationFailed') + ': ' + (error instanceof Error ? error.message : String(error)))
  }
}

async function handleDeleteRemoteInstance(id: string): Promise<void> {
  if (!confirm(t('settings.remoteDeleteConfirm'))) return
  deletingId.value = id
  try {
    await instancesStore.removeRemoteInstance(id)
    if (remoteForm.id === id) {
      resetRemoteForm()
    }
    toast.success(t('settings.remoteDeleted'))
  } catch (error) {
    toast.error(t('toast.operationFailed') + ': ' + (error instanceof Error ? error.message : String(error)))
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
  max-width: 980px;

  h1 {
    font-size: var(--font-size-2xl);
    margin-bottom: var(--spacing-xl);
  }
}

.settings-section {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
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
  border-radius: 999px;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  color: var(--text-secondary);
  font-size: var(--font-size-xs);
}

.summary-pill.online {
  color: var(--accent-primary);
  border-color: rgba(108, 158, 255, 0.35);
}

.setting-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-md);
  padding: 10px 0;

  & + .setting-row {
    border-top: 1px solid rgba(45, 53, 72, 0.5);
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
    border-radius: var(--radius-md);
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
  background: rgba(108, 158, 255, 0.05);
  color: var(--text-secondary);
  line-height: 1.6;
}

.remote-form-panel {
  background: linear-gradient(180deg, rgba(108, 158, 255, 0.06), rgba(108, 158, 255, 0.02));
  border: 1px solid rgba(108, 158, 255, 0.18);
  border-radius: var(--radius-lg);
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
    border-radius: var(--radius-md);
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
  border-radius: var(--radius-md);
  font-size: var(--font-size-sm);
}

.draft-result.ok {
  background: rgba(73, 179, 126, 0.1);
  border: 1px solid rgba(73, 179, 126, 0.25);
}

.draft-result.error {
  background: rgba(219, 83, 83, 0.1);
  border: 1px solid rgba(219, 83, 83, 0.25);
}

.draft-result-error {
  color: #f2a6a6;
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
  border-radius: var(--radius-lg);
}

.remote-instance-list {
  display: grid;
  gap: var(--spacing-md);
}

.remote-instance-card {
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
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
  border-radius: 999px;
  font-size: 11px;
  border: 1px solid transparent;
}

.status-badge.status-online {
  background: rgba(73, 179, 126, 0.12);
  color: #83d7aa;
  border-color: rgba(73, 179, 126, 0.25);
}

.status-badge.status-offline,
.status-badge.status-error {
  background: rgba(219, 83, 83, 0.12);
  color: #f2a6a6;
  border-color: rgba(219, 83, 83, 0.25);
}

.status-badge.status-connecting,
.status-badge.status-unknown {
  background: rgba(245, 179, 69, 0.12);
  color: #f5c987;
  border-color: rgba(245, 179, 69, 0.25);
}

.mode-badge {
  background: rgba(108, 158, 255, 0.08);
  color: var(--text-secondary);
  border-color: rgba(108, 158, 255, 0.2);
}

.mode-badge.muted {
  background: rgba(58, 68, 89, 0.5);
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
  border-radius: var(--radius-md);
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
  color: #f2a6a6;
  word-break: break-word;
}

.toggle-btn {
  min-width: 36px;
  height: 28px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  background: var(--bg-tertiary);
  color: var(--text-primary);
  font-size: var(--font-size-sm);
  cursor: pointer;

  &:hover {
    background: var(--bg-hover);
  }
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
  border-radius: var(--radius-md);
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
