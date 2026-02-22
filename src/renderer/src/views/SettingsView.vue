<template>
  <div class="settings-page">
    <h1>{{ $t('settings.title') }}</h1>

    <section class="settings-section">
      <h2>{{ $t('settings.appearance') }}</h2>
      <div class="setting-row">
        <label>{{ $t('settings.theme') }}</label>
        <select v-model="settingsStore.settings.theme" @change="handleSave">
          <option value="dark">{{ $t('settings.themeDark') }}</option>
          <option value="light" disabled>{{ $t('settings.themeLight') }} ({{ $t('settings.comingSoon') }})</option>
        </select>
      </div>
    </section>

    <section class="settings-section">
      <h2>{{ $t('settings.language') }}</h2>
      <div class="setting-row">
        <label>{{ $t('settings.language') }}</label>
        <select v-model="settingsStore.settings.language" @change="handleSave">
          <option value="zh-CN">中文</option>
          <option value="en">English</option>
        </select>
      </div>
    </section>

    <section class="settings-section">
      <h2>{{ $t('settings.sessions') }}</h2>
      <div class="setting-row">
        <label>{{ $t('settings.sessionWakeConfirm') }}</label>
        <input v-model="settingsStore.settings.sessionWakeConfirm" type="checkbox" @change="handleSave" />
      </div>
      <div class="setting-row">
        <label>{{ $t('settings.sessionsListPosition') }}</label>
        <button class="toggle-btn" type="button" @click="toggleSessionsListPosition">
          {{ settingsStore.settings.sessionsListPosition === 'left' ? 'L' : 'T' }}
        </button>
      </div>
      <div class="setting-row">
        <label>{{ $t('settings.sessionsPanelCollapsed') }}</label>
        <input v-model="settingsStore.settings.sessionsPanelCollapsed" type="checkbox" @change="handleSave" />
      </div>
    </section>

    <section class="settings-section">
      <h2>{{ $t('settings.cliPaths') }}</h2>
      <div class="setting-row">
        <label>{{ $t('settings.claudePath') }}</label>
        <input v-model="settingsStore.settings.claudePath" type="text" :placeholder="$t('settings.autoDetect')" @change="handleSave" />
      </div>
      <div class="setting-row">
        <label>{{ $t('settings.codexPath') }}</label>
        <input v-model="settingsStore.settings.codexPath" type="text" :placeholder="$t('settings.autoDetect')" @change="handleSave" />
      </div>
    </section>

    <section class="settings-section">
      <h2>{{ $t('settings.terminal') }}</h2>
      <div class="setting-row">
        <label>{{ $t('settings.bufferSize') }}</label>
        <input v-model.number="settingsStore.settings.bufferSize" type="number" min="1000" max="50000" step="1000" @change="handleSave" />
      </div>
      <div class="setting-row">
        <label>{{ $t('settings.terminalFont') }}</label>
        <input v-model="settingsStore.settings.terminalFont" type="text" @change="handleSave" />
      </div>
    </section>

    <section class="settings-section">
      <h2>{{ $t('settings.about') }}</h2>
      <div class="about-grid">
        <div class="about-item">
          <span class="about-label">{{ $t('settings.version') }}</span>
          <span class="about-value">{{ appStore.version || '-' }}</span>
        </div>
        <div class="about-item">
          <span class="about-label">{{ $t('settings.electronVersion') }}</span>
          <span class="about-value">{{ systemInfo.electronVersion || '-' }}</span>
        </div>
        <div class="about-item">
          <span class="about-label">{{ $t('settings.nodeVersion') }}</span>
          <span class="about-value">{{ systemInfo.nodeVersion || '-' }}</span>
        </div>
        <div class="about-item">
          <span class="about-label">{{ $t('settings.system') }}</span>
          <span class="about-value">{{ systemInfo.platform }} ({{ systemInfo.arch }})</span>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onActivated } from 'vue'
import { useSettingsStore } from '@/stores/settings'
import { useAppStore } from '@/stores/app'
import { useToast } from '@/composables/useToast'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const settingsStore = useSettingsStore()
const appStore = useAppStore()
const toast = useToast()

const systemInfo = ref({ electronVersion: '', nodeVersion: '', platform: '', arch: '' })

async function handleSave() {
  try {
    await settingsStore.save()
    toast.success(t('toast.settingsSaved'))
  } catch {
    toast.error(t('toast.settingsSaveFail'))
  }
}

function toggleSessionsListPosition() {
  settingsStore.settings.sessionsListPosition = settingsStore.settings.sessionsListPosition === 'left' ? 'top' : 'left'
  handleSave()
}

async function loadSystemInfo() {
  try {
    const info = await window.electronAPI.invoke('app:getSystemInfo') as typeof systemInfo.value
    systemInfo.value = info
  } catch { /* ignore */ }
}

onMounted(async () => {
  if (!settingsStore.loaded) await settingsStore.load()
  await loadSystemInfo()
})

onActivated(loadSystemInfo)
</script>

<style scoped lang="scss">
.settings-page {
  padding: var(--spacing-xl);
  max-width: 720px;

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

.setting-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 0;

  & + .setting-row { border-top: 1px solid rgba(45, 53, 72, 0.5); }

  label {
    font-size: var(--font-size-md);
    color: var(--text-primary);
  }

  select, input {
    background: var(--bg-primary);
    color: var(--text-primary);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    padding: var(--spacing-xs) var(--spacing-sm);
    font-size: var(--font-size-sm);
    min-width: 200px;

    &:focus { outline: none; border-color: var(--accent-primary); }
    &:disabled { opacity: 0.5; }
  }

  input[type="number"] { width: 120px; min-width: auto; }
  input[type="checkbox"] {
    width: 18px;
    min-width: auto;
    height: 18px;
    padding: 0;
    accent-color: var(--accent-primary);
  }
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

  &:hover { background: var(--bg-hover); }
}

.setting-hint {
  font-size: var(--font-size-xs);
  color: var(--text-muted);
  padding: 0 0 var(--spacing-xs);
}

.about-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
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
  font-family: var(--font-mono);
}
</style>
