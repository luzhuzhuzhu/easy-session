<template>
  <section class="settings-section">
    <h2>{{ $t('settings.about') }}</h2>
    <div class="about-grid">
      <div class="about-item">
        <span class="about-label">{{ $t('settings.version') }}</span>
        <span class="about-value">{{ version || '-' }}</span>
      </div>
      <div class="about-item">
        <span class="about-label">{{ $t('settings.electronVersion') }}</span>
        <span class="about-value">{{ electronVersion || '-' }}</span>
      </div>
      <div class="about-item">
        <span class="about-label">{{ $t('settings.nodeVersion') }}</span>
        <span class="about-value">{{ nodeVersion || '-' }}</span>
      </div>
      <div class="about-item">
        <span class="about-label">{{ $t('settings.system') }}</span>
        <span class="about-value">{{ platform }} ({{ arch }})</span>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'

defineProps<{
  version: string
  electronVersion: string
  nodeVersion: string
  platform: string
  arch: string
}>()

useI18n()
</script>

<style scoped lang="scss">
.settings-section {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 0;
  padding: var(--spacing-sm);
  margin-bottom: var(--spacing-sm);

  h2 {
    font-size: var(--font-size-sm);
    margin-bottom: var(--spacing-xs);
    color: var(--text-secondary);
  }
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
  border-radius: 0;
}

.about-label {
  font-size: var(--font-size-xs);
  color: var(--text-muted);
}

.about-value {
  font-size: var(--font-size-sm);
  font-family: var(--font-mono);
  word-break: break-word;
}

@media (max-width: 960px) {
  .about-grid {
    grid-template-columns: 1fr;
  }
}
</style>
