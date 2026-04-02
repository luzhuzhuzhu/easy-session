<template>
  <section
    ref="sectionRef"
    class="settings-section settings-section-remote"
    @pointerenter="$emit('activate')"
  >
    <div class="section-head">
      <div>
        <h2>{{ $t('settings.localRemoteService') }}</h2>
        <p class="setting-hint section-hint">{{ $t('settings.localRemoteServiceHint') }}</p>
      </div>
      <div class="instance-summary">
        <span class="summary-pill" :class="{ online: state?.running }">
          {{ state?.running ? $t('settings.remoteServiceRunning') : $t('settings.remoteServiceStopped') }}
        </span>
        <span class="summary-pill">{{ state?.tokenSource ? formatTokenSource(state.tokenSource) : '-' }}</span>
      </div>
    </div>

    <div v-if="!active" class="remote-disabled-state">
      {{ $t('settings.deferredSectionHint') }}
    </div>

    <div v-else-if="loading" class="remote-disabled-state">
      {{ $t('settings.remoteServiceLoading') }}
    </div>

    <template v-else>
      <div v-if="hasEnvOverrides" class="remote-disabled-state remote-service-env-note">
        {{ $t('settings.remoteServiceEnvOverrideHint', { fields: envOverrideFields }) }}
      </div>

      <div class="remote-form-panel">
        <div class="remote-form-grid">
          <label class="checkbox-row field-block field-block-inline-start">
            <input v-model="form.enabled" type="checkbox" />
            <span>{{ $t('settings.remoteServiceEnabled') }}</span>
          </label>
          <label class="checkbox-row field-block field-block-inline-start">
            <input v-model="form.passthroughOnly" type="checkbox" />
            <span>{{ $t('settings.remoteServicePassthroughOnly') }}</span>
          </label>
          <div class="field-block field-block-wide field-hint-only">
            <span class="setting-hint inline-hint">{{ $t('settings.remoteServiceControlRiskHint') }}</span>
          </div>
          <div class="field-block">
            <label>{{ $t('settings.remoteServiceHost') }}</label>
            <input v-model.trim="form.host" type="text" :placeholder="$t('settings.remoteServiceHostPlaceholder')" />
          </div>
          <div class="field-block">
            <label>{{ $t('settings.remoteServicePort') }}</label>
            <input v-model.number="form.port" type="number" min="1" max="65535" />
          </div>
          <div class="field-block">
            <label>{{ $t('settings.remoteServiceTokenMode') }}</label>
            <select v-model="form.tokenMode">
              <option value="default">{{ $t('settings.remoteServiceTokenModeDefault') }}</option>
              <option value="custom">{{ $t('settings.remoteServiceTokenModeCustom') }}</option>
            </select>
          </div>
          <div class="field-block field-block-wide">
            <label>{{ $t('settings.remoteServiceCustomToken') }}</label>
            <input
              v-model.trim="form.customToken"
              type="password"
              autocomplete="new-password"
              :placeholder="
                form.tokenMode === 'custom'
                  ? $t('settings.remoteServiceCustomTokenPlaceholder')
                  : $t('settings.remoteServiceCustomTokenDisabled')
              "
              :disabled="form.tokenMode !== 'custom'"
            />
            <span v-if="form.tokenMode === 'custom' && state?.customTokenConfigured" class="setting-hint inline-hint">
              {{ $t('settings.remoteServiceCustomTokenKeepHint') }}
            </span>
          </div>
        </div>

        <div class="remote-form-actions">
          <button
            class="btn btn-primary btn-sm"
            type="button"
            :disabled="saving || !canSubmit"
            @click="$emit('save')"
          >
            {{ saving ? $t('settings.remoteServiceApplying') : $t('settings.remoteServiceApply') }}
          </button>
          <button
            class="btn btn-sm"
            type="button"
            :disabled="saving || !state"
            @click="$emit('reset-form')"
          >
            {{ $t('settings.remoteServiceResetForm') }}
          </button>
          <button
            class="btn btn-sm"
            type="button"
            :disabled="saving || resettingToken || !state?.customTokenConfigured"
            @click="$emit('reset-token')"
          >
            {{
              resettingToken
                ? $t('settings.remoteServiceResettingToken')
                : $t('settings.remoteServiceResetToDefaultToken')
            }}
          </button>
          <button
            class="btn btn-sm"
            type="button"
            :disabled="copyingToken || !state"
            @click="$emit('copy-token')"
          >
            {{ copyingToken ? $t('settings.remoteServiceCopyingToken') : $t('settings.remoteServiceCopyToken') }}
          </button>
          <button
            class="btn btn-sm"
            type="button"
            :disabled="regeneratingToken"
            @click="$emit('regenerate-token')"
          >
            {{
              regeneratingToken
                ? $t('settings.remoteServiceRegeneratingToken')
                : $t('settings.remoteServiceRegenerateDefaultToken')
            }}
          </button>
        </div>
      </div>

      <div v-if="state" class="remote-card-grid">
        <div class="meta-item">
          <span class="meta-label">{{ $t('settings.remoteServiceConfiguredEnabled') }}</span>
          <span class="meta-value">{{ state.configuredEnabled ? $t('settings.remoteYes') : $t('settings.remoteNo') }}</span>
        </div>
        <div class="meta-item">
          <span class="meta-label">{{ $t('settings.remoteServiceEffectiveEnabled') }}</span>
          <span class="meta-value">{{ state.effectiveEnabled ? $t('settings.remoteYes') : $t('settings.remoteNo') }}</span>
        </div>
        <div class="meta-item">
          <span class="meta-label">{{ $t('settings.remoteServiceCurrentBaseUrl') }}</span>
          <span class="meta-value mono">{{ state.baseUrl }}</span>
        </div>
        <div class="meta-item">
          <span class="meta-label">{{ $t('settings.remoteServiceTokenSource') }}</span>
          <span class="meta-value">{{ formatTokenSource(state.tokenSource) }}</span>
        </div>
        <div class="meta-item">
          <span class="meta-label">{{ $t('settings.remoteServiceTokenFingerprint') }}</span>
          <span class="meta-value mono">{{ state.tokenFingerprint }}</span>
        </div>
        <div class="meta-item">
          <span class="meta-label">{{ $t('settings.remoteServiceTokenFilePath') }}</span>
          <span class="meta-value mono">{{ state.tokenFilePath }}</span>
        </div>
      </div>
    </template>
  </section>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { RemoteServiceState, RemoteServiceTokenMode, RemoteServiceTokenSource } from '@/api/remote-service'

interface RemoteServiceSectionForm {
  enabled: boolean
  host: string
  port: number
  passthroughOnly: boolean
  tokenMode: RemoteServiceTokenMode
  customToken: string
}

defineProps<{
  active: boolean
  loading: boolean
  state: RemoteServiceState | null
  hasEnvOverrides: boolean
  envOverrideFields: string
  form: RemoteServiceSectionForm
  canSubmit: boolean
  saving: boolean
  copyingToken: boolean
  regeneratingToken: boolean
  resettingToken: boolean
  formatTokenSource: (source: RemoteServiceTokenSource) => string
}>()

defineEmits<{
  activate: []
  save: []
  'reset-form': []
  'reset-token': []
  'copy-token': []
  'regenerate-token': []
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
  border-radius: 0;
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
  border-radius: 0;
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
    border-radius: 0;
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

.inline-hint {
  padding: 0;
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
  border-radius: 0;
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

@media (max-width: 900px) {
  .section-head {
    flex-direction: column;
  }

  .remote-form-grid,
  .remote-card-grid {
    grid-template-columns: 1fr;
  }
}
</style>
