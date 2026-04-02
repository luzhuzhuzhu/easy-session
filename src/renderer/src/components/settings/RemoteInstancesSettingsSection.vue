<template>
  <section
    ref="sectionRef"
    class="settings-section settings-section-remote"
    @pointerenter="$emit('activate')"
  >
    <div class="section-head">
      <div>
        <h2>{{ $t('settings.remoteInstances') }}</h2>
        <p class="setting-hint section-hint">{{ $t('settings.remoteInstancesHint') }}</p>
      </div>
      <div class="instance-summary">
        <span class="summary-pill">{{ $t('settings.remoteCount', { count: instances.length }) }}</span>
        <span class="summary-pill online">{{ $t('settings.remoteOnlineCount', { count: onlineCount }) }}</span>
      </div>
    </div>

    <div class="setting-row setting-row-stack remote-toggle-row">
      <div class="setting-label-group">
        <label>{{ $t('settings.desktopRemoteMountEnabled') }}</label>
        <p class="setting-hint">{{ $t('settings.desktopRemoteMountHint') }}</p>
      </div>
      <input
        :checked="desktopRemoteMountEnabled"
        type="checkbox"
        @change="$emit('toggle-desktop-remote-mount', ($event.target as HTMLInputElement).checked)"
      />
    </div>

    <div v-if="!desktopRemoteMountEnabled" class="remote-disabled-state">
      {{ $t('settings.desktopRemoteMountDisabled') }}
    </div>

    <template v-else>
      <div v-if="!active" class="remote-disabled-state">
        {{ $t('settings.deferredSectionHint') }}
      </div>
      <template v-else>
        <div class="remote-form-panel">
          <div class="remote-form-grid">
            <div class="field-block">
              <label>{{ $t('settings.remoteName') }}</label>
              <input
                v-model.trim="form.name"
                type="text"
                :placeholder="$t('settings.remoteNamePlaceholder')"
              />
            </div>
            <div class="field-block field-block-wide">
              <label>{{ $t('settings.remoteBaseUrl') }}</label>
              <input
                v-model.trim="form.baseUrl"
                type="text"
                :placeholder="$t('settings.remoteBaseUrlPlaceholder')"
              />
            </div>
            <div class="field-block field-block-wide">
              <label>{{ $t('settings.remoteToken') }}</label>
              <input
                v-model.trim="form.token"
                type="password"
                autocomplete="new-password"
                :placeholder="$t('settings.remoteTokenPlaceholder')"
              />
            </div>
            <label class="checkbox-row field-block-inline">
              <input v-model="form.enabled" type="checkbox" />
              <span>{{ $t('settings.remoteEnabled') }}</span>
            </label>
          </div>

          <div class="remote-form-actions">
            <button
              class="btn btn-primary btn-sm"
              type="button"
              :disabled="saving || !canSubmit"
              @click="$emit('save')"
            >
              {{
                saving
                  ? $t('settings.remoteSaving')
                  : (isEditing ? $t('settings.remoteUpdate') : $t('settings.remoteAdd'))
              }}
            </button>
            <button
              v-if="isEditing"
              class="btn btn-sm"
              type="button"
              :disabled="saving"
              @click="$emit('cancel-edit')"
            >
              {{ $t('settings.remoteCancelEdit') }}
            </button>
          </div>
        </div>

        <div v-if="instances.length === 0" class="remote-empty-state">
          {{ $t('settings.remoteEmpty') }}
        </div>
        <div v-else class="remote-instance-list">
          <article
            v-for="instance in instances"
            :key="instance.id"
            class="remote-instance-card"
            :class="[`status-${instance.status}`, { disabled: !instance.enabled }]"
          >
            <div class="remote-card-head">
              <div class="remote-card-title">
                <div class="remote-title-line">
                  <h3>{{ instance.name }}</h3>
                  <span class="status-badge" :class="`status-${instance.status}`">
                    {{ formatStatusText(instance.status) }}
                  </span>
                  <span class="mode-badge">
                    {{ instance.passthroughOnly ? $t('settings.remoteModePassthrough') : $t('settings.remoteModeManaged') }}
                  </span>
                  <span v-if="!instance.enabled" class="mode-badge muted">
                    {{ $t('settings.remoteDisabled') }}
                  </span>
                </div>
                <p class="remote-card-url">{{ instance.baseUrl }}</p>
              </div>
              <div class="remote-card-actions">
                <button
                  class="btn btn-sm"
                  type="button"
                  :disabled="busyInstanceIds.includes(instance.id)"
                  @click="$emit('edit-instance', instance)"
                >
                  {{ $t('settings.remoteEdit') }}
                </button>
                <button
                  class="btn btn-danger btn-sm"
                  type="button"
                  :disabled="busyInstanceIds.includes(instance.id)"
                  @click="$emit('delete-instance', instance.id)"
                >
                  {{ $t('settings.remoteDelete') }}
                </button>
              </div>
            </div>

            <div class="remote-card-grid">
              <div class="meta-item">
                <span class="meta-label">{{ $t('settings.remoteBaseUrl') }}</span>
                <span class="meta-value mono">{{ instance.baseUrl }}</span>
              </div>
              <div class="meta-item">
                <span class="meta-label">{{ $t('settings.remotePassthrough') }}</span>
                <span class="meta-value">{{ instance.passthroughOnly ? $t('settings.remoteYes') : $t('settings.remoteNo') }}</span>
              </div>
              <div class="meta-item">
                <span class="meta-label">{{ $t('settings.remoteLatency') }}</span>
                <span class="meta-value">{{ formatLatencyLabel(instance.latencyMs, instance.status) }}</span>
              </div>
              <div class="meta-item">
                <span class="meta-label">{{ $t('settings.remoteLastChecked') }}</span>
                <span class="meta-value">{{ formatLastChecked(instance.lastCheckedAt) }}</span>
              </div>
            </div>
          </article>
        </div>
      </template>
    </template>
  </section>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { RemoteInstance } from '@/models/unified-resource'

interface RemoteFormState {
  id: string | null
  name: string
  baseUrl: string
  token: string
  enabled: boolean
}

defineProps<{
  active: boolean
  desktopRemoteMountEnabled: boolean
  instances: RemoteInstance[]
  onlineCount: number
  form: RemoteFormState
  isEditing: boolean
  canSubmit: boolean
  saving: boolean
  busyInstanceIds: string[]
  formatStatusText: (status: RemoteInstance['status']) => string
  formatLatencyLabel: (latencyMs: number | null, status: RemoteInstance['status']) => string
  formatLastChecked: (value: number | null) => string
}>()

defineEmits<{
  activate: []
  'toggle-desktop-remote-mount': [value: boolean]
  save: []
  'cancel-edit': []
  'edit-instance': [instance: RemoteInstance]
  'delete-instance': [id: string]
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

.setting-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-md);
  padding: 10px 0;

  label {
    font-size: var(--font-size-md);
    color: var(--text-primary);
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

.setting-hint {
  font-size: var(--font-size-xs);
  color: var(--text-muted);
  padding: 0 0 var(--spacing-xs);
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

  input {
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

.field-block-inline {
  justify-content: flex-end;
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

.remote-empty-state {
  padding: var(--spacing-lg);
  text-align: center;
  color: var(--text-muted);
  border: 1px dashed var(--border-color);
  border-radius: 0;
}

.remote-instance-list {
  display: grid;
  gap: var(--spacing-md);
}

.remote-instance-card {
  border: 1px solid var(--border-color);
  border-radius: 0;
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

@media (max-width: 960px) {
  .section-head,
  .remote-card-head,
  .setting-row {
    flex-direction: column;
    align-items: stretch;
  }

  .remote-form-grid,
  .remote-card-grid {
    grid-template-columns: 1fr;
  }
}
</style>
