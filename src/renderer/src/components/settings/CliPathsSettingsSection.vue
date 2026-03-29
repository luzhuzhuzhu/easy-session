<template>
  <section class="settings-section">
    <h2>{{ $t('settings.cliPaths') }}</h2>
    <div class="setting-row">
      <label>{{ $t('settings.claudePath') }}</label>
      <input
        :value="claudePath"
        type="text"
        :placeholder="$t('settings.autoDetect')"
        @change="$emit('update:claude-path', ($event.target as HTMLInputElement).value)"
      />
    </div>
    <div class="setting-row">
      <label>{{ $t('settings.codexPath') }}</label>
      <input
        :value="codexPath"
        type="text"
        :placeholder="$t('settings.autoDetect')"
        @change="$emit('update:codex-path', ($event.target as HTMLInputElement).value)"
      />
    </div>
    <div class="setting-row">
      <label>{{ $t('settings.opencodePath') }}</label>
      <input
        :value="opencodePath"
        type="text"
        :placeholder="$t('settings.autoDetect')"
        @change="$emit('update:opencode-path', ($event.target as HTMLInputElement).value)"
      />
    </div>
  </section>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'

defineProps<{
  claudePath: string
  codexPath: string
  opencodePath: string
}>()

defineEmits<{
  'update:claude-path': [value: string]
  'update:codex-path': [value: string]
  'update:opencode-path': [value: string]
}>()

useI18n()
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
  }
}

@media (max-width: 960px) {
  .setting-row {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
