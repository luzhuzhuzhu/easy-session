<template>
  <section class="settings-section">
    <h2>{{ $t('settings.appearance') }}</h2>
    <div class="setting-row">
      <label>{{ $t('settings.theme') }}</label>
      <div class="theme-options" role="group" :aria-label="$t('settings.theme')">
        <button
          v-for="option in themeOptions"
          :key="option.value"
          class="theme-option"
          :class="{ active: theme === option.value }"
          type="button"
          :aria-pressed="theme === option.value"
          :disabled="option.disabled"
          :title="$t(option.labelKey)"
          @click="emit('update:theme', option.value)"
        >
          <span class="theme-swatch" :class="`theme-swatch-${option.value}`" aria-hidden="true">
            <span></span>
            <span></span>
          </span>
          <span>{{ $t(option.labelKey) }}</span>
        </button>
      </div>
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
      <IconButton
        :label="$t('settings.sessionsListPosition')"
        :title="$t('settings.sessionsListPosition')"
        size="md"
        @click="$emit('toggle-sessions-list-position')"
      >
        <UiIcon :name="sessionsListPosition === 'left' ? 'list-left' : 'list-top'" />
      </IconButton>
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
import IconButton from '@/components/ui/IconButton.vue'
import UiIcon from '@/components/ui/UiIcon.vue'
import type { AppTheme } from '@/stores/settings'

defineProps<{
  theme: AppTheme
  language: 'zh-CN' | 'en'
  sessionWakeConfirm: boolean
  sessionsListPosition: 'left' | 'top'
  sessionsPanelCollapsed: boolean
  smartPriorityEnabled: boolean
  smartPriorityScope: 'projects' | 'sessions' | 'both'
  smartPriorityMode: 'recent' | 'balanced'
}>()

const emit = defineEmits<{
  'update:theme': [value: AppTheme]
  'update:language': [value: 'zh-CN' | 'en']
  'update:session-wake-confirm': [value: boolean]
  'toggle-sessions-list-position': []
  'update:sessions-panel-collapsed': [value: boolean]
  'update:smart-priority-enabled': [value: boolean]
  'update:smart-priority-scope': [value: 'projects' | 'sessions' | 'both']
  'update:smart-priority-mode': [value: 'recent' | 'balanced']
}>()

useI18n()

const themeOptions: Array<{ value: AppTheme; labelKey: string; disabled?: boolean }> = [
  { value: 'chatgpt-dark', labelKey: 'settings.themeChatGPTDark' },
  { value: 'gemini-dark', labelKey: 'settings.themeGeminiDark' }
]

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
  border-radius: 0;
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
    border-radius: 0;
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

.theme-options {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
  max-width: 520px;
}

.theme-option {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  min-height: 32px;
  padding: 5px 9px;
  border: 1px solid var(--border-color);
  border-radius: 0;
  background: var(--bg-primary);
  color: var(--text-secondary);
  font-size: var(--font-size-xs);
  cursor: pointer;
  transition: border-color var(--transition-fast), background var(--transition-fast), color var(--transition-fast);

  &:hover {
    border-color: var(--border-light);
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  &.active {
    border-color: color-mix(in srgb, var(--accent-primary) 58%, var(--border-color));
    background: color-mix(in srgb, var(--accent-primary) 10%, var(--bg-primary));
    color: var(--text-primary);
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.48;
  }
}

.theme-swatch {
  display: inline-grid;
  grid-template-columns: 14px 14px;
  width: 28px;
  height: 18px;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--border-light) 70%, transparent);
  background: #111418;

  span {
    display: block;
  }
}

.theme-swatch-chatgpt-dark {
  background: #0d0d0d;
  span:first-child { background: #171717; }
  span:last-child { background: #f7f7f7; }
}

.theme-swatch-gemini-dark {
  background: #131314;
  span:first-child { background: #1f3760; }
  span:last-child { background: #d3e3fd; }
}

@media (max-width: 960px) {
  .setting-row {
    flex-direction: column;
    align-items: stretch;
  }

  .theme-options {
    justify-content: flex-start;
  }
}
</style>
