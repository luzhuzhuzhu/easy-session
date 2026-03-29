<template>
  <section class="settings-section">
    <h2>{{ $t('settings.appearance') }}</h2>
    <div class="setting-row">
      <label>{{ $t('settings.theme') }}</label>
      <select
        :value="theme"
        @change="handleThemeChange"
      >
        <option value="dark">{{ $t('settings.themeDark') }}</option>
        <option value="light" disabled>{{ $t('settings.themeLight') }} ({{ $t('settings.comingSoon') }})</option>
      </select>
    </div>
  </section>

  <section class="settings-section">
    <h2>{{ $t('settings.language') }}</h2>
    <div class="setting-row">
      <label>{{ $t('settings.language') }}</label>
      <select
        :value="language"
        @change="handleLanguageChange"
      >
        <option value="zh-CN">中文</option>
        <option value="en">English</option>
      </select>
    </div>
  </section>

  <section class="settings-section">
    <h2>{{ $t('settings.sessions') }}</h2>
    <div class="setting-row">
      <label>{{ $t('settings.sessionWakeConfirm') }}</label>
      <input
        :checked="sessionWakeConfirm"
        type="checkbox"
        @change="$emit('update:session-wake-confirm', ($event.target as HTMLInputElement).checked)"
      />
    </div>
    <div class="setting-row">
      <label>{{ $t('settings.sessionsListPosition') }}</label>
      <button class="toggle-btn" type="button" @click="$emit('toggle-sessions-list-position')">
        {{ sessionsListPosition === 'left' ? 'L' : 'T' }}
      </button>
    </div>
    <div class="setting-row">
      <label>{{ $t('settings.sessionsPanelCollapsed') }}</label>
      <input
        :checked="sessionsPanelCollapsed"
        type="checkbox"
        @change="$emit('update:sessions-panel-collapsed', ($event.target as HTMLInputElement).checked)"
      />
    </div>
    <div class="setting-row">
      <label>{{ $t('settings.smartPriorityEnabled') }}</label>
      <input
        :checked="smartPriorityEnabled"
        type="checkbox"
        @change="$emit('update:smart-priority-enabled', ($event.target as HTMLInputElement).checked)"
      />
    </div>
    <div class="setting-row">
      <label>{{ $t('settings.smartPriorityScope') }}</label>
      <select
        :value="smartPriorityScope"
        @change="handleSmartPriorityScopeChange"
      >
        <option value="both">{{ $t('settings.smartPriorityScopeBoth') }}</option>
        <option value="sessions">{{ $t('settings.smartPriorityScopeSessions') }}</option>
        <option value="projects">{{ $t('settings.smartPriorityScopeProjects') }}</option>
      </select>
    </div>
    <div class="setting-row">
      <label>{{ $t('settings.smartPriorityMode') }}</label>
      <select
        :value="smartPriorityMode"
        @change="handleSmartPriorityModeChange"
      >
        <option value="balanced">{{ $t('settings.smartPriorityModeBalanced') }}</option>
        <option value="recent">{{ $t('settings.smartPriorityModeRecent') }}</option>
      </select>
    </div>
  </section>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'

defineProps<{
  theme: 'dark' | 'light'
  language: 'zh-CN' | 'en'
  sessionWakeConfirm: boolean
  sessionsListPosition: 'left' | 'top'
  sessionsPanelCollapsed: boolean
  smartPriorityEnabled: boolean
  smartPriorityScope: 'projects' | 'sessions' | 'both'
  smartPriorityMode: 'recent' | 'balanced'
}>()

const emit = defineEmits<{
  'update:theme': [value: 'dark' | 'light']
  'update:language': [value: 'zh-CN' | 'en']
  'update:session-wake-confirm': [value: boolean]
  'toggle-sessions-list-position': []
  'update:sessions-panel-collapsed': [value: boolean]
  'update:smart-priority-enabled': [value: boolean]
  'update:smart-priority-scope': [value: 'projects' | 'sessions' | 'both']
  'update:smart-priority-mode': [value: 'recent' | 'balanced']
}>()

useI18n()

function handleThemeChange(event: Event): void {
  const value = (event.target as HTMLSelectElement | null)?.value
  emit('update:theme', value === 'light' ? 'light' : 'dark')
}

function handleLanguageChange(event: Event): void {
  const value = (event.target as HTMLSelectElement | null)?.value
  emit('update:language', value === 'en' ? 'en' : 'zh-CN')
}

function handleSmartPriorityScopeChange(event: Event): void {
  const value = (event.target as HTMLSelectElement | null)?.value
  if (value === 'projects' || value === 'sessions') {
    emit('update:smart-priority-scope', value)
    return
  }
  emit('update:smart-priority-scope', 'both')
}

function handleSmartPriorityModeChange(event: Event): void {
  const value = (event.target as HTMLSelectElement | null)?.value
  emit('update:smart-priority-mode', value === 'recent' ? 'recent' : 'balanced')
}
</script>

<style scoped lang="scss">
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

  input[type='checkbox'] {
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

  &:hover {
    background: var(--bg-hover);
  }
}

@media (max-width: 960px) {
  .setting-row {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
