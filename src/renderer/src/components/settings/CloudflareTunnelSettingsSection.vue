<template>
  <section
    ref="sectionRef"
    class="settings-section settings-section-remote"
    @pointerenter="$emit('activate')"
  >
    <div class="section-head">
      <div>
        <h2>{{ $t('settings.cloudflareTunnel') }}</h2>
        <p class="setting-hint section-hint">{{ $t('settings.cloudflareTunnelHint') }}</p>
      </div>
      <div class="instance-summary">
        <span class="summary-pill" :class="{ online: state?.running }">
          {{
            state?.running
              ? $t('settings.cloudflareTunnelRunning')
              : $t('settings.cloudflareTunnelStopped')
          }}
        </span>
        <span class="summary-pill">
          {{ state?.pathSource ? formatPathSource(state.pathSource) : '-' }}
        </span>
      </div>
    </div>

    <div v-if="!active" class="remote-disabled-state">
      {{ $t('settings.deferredSectionHint') }}
    </div>

    <div v-else-if="loading" class="remote-disabled-state">
      {{ $t('settings.cloudflareTunnelLoading') }}
    </div>

    <template v-else>
      <div class="remote-form-panel">
        <div class="remote-form-grid">
          <div class="field-block field-block-wide">
            <label>{{ $t('settings.cloudflareTunnelBinaryPath') }}</label>
            <input
              :value="binaryPath"
              type="text"
              :placeholder="$t('settings.cloudflareTunnelBinaryPathPlaceholder')"
              @input="$emit('update:binary-path', ($event.target as HTMLInputElement).value)"
            />
            <span class="setting-hint inline-hint">
              {{ $t('settings.cloudflareTunnelBinaryPathHint') }}
            </span>
          </div>
        </div>

        <div class="remote-form-actions">
          <button
            class="btn btn-sm"
            type="button"
            :disabled="savingConfig"
            @click="$emit('save-config')"
          >
            {{
              savingConfig
                ? $t('settings.cloudflareTunnelConfigSaving')
                : $t('settings.cloudflareTunnelConfigSave')
            }}
          </button>
          <button
            class="btn btn-primary btn-sm"
            type="button"
            :disabled="starting || !canStart || !!state?.running"
            @click="$emit('start')"
          >
            {{
              starting
                ? $t('settings.cloudflareTunnelStarting')
                : $t('settings.cloudflareTunnelStart')
            }}
          </button>
          <button
            class="btn btn-sm"
            type="button"
            :disabled="stopping || !state?.running"
            @click="$emit('stop')"
          >
            {{
              stopping
                ? $t('settings.cloudflareTunnelStopping')
                : $t('settings.cloudflareTunnelStop')
            }}
          </button>
          <button
            class="btn btn-sm"
            type="button"
            :disabled="copyingUrl || !state?.publicUrl"
            @click="$emit('copy-url')"
          >
            {{
              copyingUrl
                ? $t('settings.cloudflareTunnelUrlCopying')
                : $t('settings.cloudflareTunnelCopyUrl')
            }}
          </button>
        </div>
      </div>

      <div v-if="showRemoteServiceWarning" class="remote-disabled-state remote-service-env-note">
        {{ $t('settings.cloudflareTunnelRequiresRemoteService') }}
      </div>

      <div v-if="state" class="remote-card-grid">
        <div class="meta-item">
          <span class="meta-label">{{ $t('settings.cloudflareTunnelAvailability') }}</span>
          <span class="meta-value">{{ state.available ? $t('settings.remoteYes') : $t('settings.remoteNo') }}</span>
        </div>
        <div class="meta-item">
          <span class="meta-label">{{ $t('settings.cloudflareTunnelPathSource') }}</span>
          <span class="meta-value">{{ formatPathSource(state.pathSource) }}</span>
        </div>
        <div class="meta-item meta-item-full">
          <span class="meta-label">{{ $t('settings.cloudflareTunnelEffectiveBinaryPath') }}</span>
          <span class="meta-value mono">{{ state.effectiveBinaryPath || '-' }}</span>
        </div>
        <div class="meta-item meta-item-full">
          <span class="meta-label">{{ $t('settings.cloudflareTunnelLocalTarget') }}</span>
          <span class="meta-value mono">{{ state.localTargetUrl || '-' }}</span>
        </div>
        <div class="meta-item meta-item-full">
          <span class="meta-label">{{ $t('settings.cloudflareTunnelPublicUrl') }}</span>
          <span class="meta-value mono">{{ state.publicUrl || '-' }}</span>
        </div>
      </div>
    </template>
  </section>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { CloudflareTunnelState } from '@/api/cloudflare-tunnel'

defineProps<{
  active: boolean
  loading: boolean
  state: CloudflareTunnelState | null
  binaryPath: string
  canStart: boolean
  showRemoteServiceWarning: boolean
  savingConfig: boolean
  starting: boolean
  stopping: boolean
  copyingUrl: boolean
  formatPathSource: (source: CloudflareTunnelState['pathSource']) => string
}>()

defineEmits<{
  activate: []
  'update:binary-path': [value: string]
  'save-config': []
  start: []
  stop: []
  'copy-url': []
}>()

useI18n()
const sectionRef = ref<HTMLElement | null>(null)

defineExpose({
  rootEl: sectionRef
})
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

  input {
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

.inline-hint {
  padding: 0;
}

.remote-form-actions {
  display: flex;
  gap: 8px;
  margin-top: var(--spacing-md);
  flex-wrap: wrap;
}

.remote-service-env-note {
  margin-bottom: var(--spacing-md);
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

.meta-value.mono {
  font-family: var(--font-mono);
}

.setting-hint {
  font-size: var(--font-size-xs);
  color: var(--text-muted);
  padding: 0 0 var(--spacing-xs);
}

@media (max-width: 960px) {
  .section-head {
    flex-direction: column;
    align-items: stretch;
  }

  .remote-form-grid,
  .remote-card-grid {
    grid-template-columns: 1fr;
  }

  .meta-item-full {
    grid-column: auto;
  }
}
</style>
