<template>
  <section class="resume-section">
    <div class="section-head">
      <div>
        <h4>{{ title }}</h4>
        <p v-if="description" class="section-description">{{ description }}</p>
      </div>
      <span v-if="autoSelected" class="auto-badge" role="status">{{ autoSelectedLabel }}</span>
    </div>

    <label class="field-label" :for="inputId">{{ label }}</label>
    <div class="resume-row">
      <input
        :id="inputId"
        :value="modelValue"
        type="text"
        class="form-input"
        :placeholder="placeholder"
        autocomplete="off"
        @input="handleInput"
      />
      <button
        v-if="canPick"
        type="button"
        class="pick-button"
        :aria-expanded="pickerOpen"
        :aria-controls="panelId"
        @click="$emit('toggle-picker')"
      >
        {{ pickerOpen ? closeLabel : pickLabel }}
      </button>
    </div>

    <label v-if="showContinue" class="continue-label">
      <input
        type="checkbox"
        :checked="continueLast"
        @change="$emit('update:continueLast', ($event.target as HTMLInputElement).checked)"
      />
      <span>{{ continueLabel }}</span>
    </label>

    <p v-if="showContinue && modelValue && continueLast" class="conflict-hint" role="alert">
      {{ conflictLabel }}
    </p>

    <p class="sr-only" role="status" aria-live="polite" aria-atomic="true">{{ liveStatusText }}</p>

    <div v-if="pickerOpen" :id="panelId" class="picker-panel">
      <div v-if="status === 'ready' && candidates.length" class="search-row">
        <label class="sr-only" :for="searchId">{{ searchLabel }}</label>
        <input
          :id="searchId"
          v-model="searchQuery"
          type="search"
          class="form-input candidate-search"
          :placeholder="searchPlaceholder"
          autocomplete="off"
        />
      </div>

      <p v-if="status === 'loading'" class="state-message">{{ loadingLabel }}</p>
      <div v-else-if="status === 'error'" class="state-block error" role="alert">
        <p class="state-message">{{ statusMessage || errorLabel }}</p>
        <button type="button" class="retry-button" @click="$emit('retry')">{{ retryLabel }}</button>
      </div>
      <p v-else-if="status === 'unsupported'" class="state-message">{{ statusMessage || unsupportedLabel }}</p>
      <p v-else-if="status === 'empty' || candidates.length === 0" class="state-message">{{ statusMessage || emptyLabel }}</p>
      <p v-else-if="filteredCandidates.length === 0" class="state-message">{{ searchEmptyLabel }}</p>
      <ul v-else class="candidate-list" :aria-label="listLabel">
        <li v-for="candidate in filteredCandidates" :key="candidate.id">
          <button
            type="button"
            class="candidate-item"
            :class="{ selected: candidate.id === modelValue }"
            :aria-pressed="candidate.id === modelValue"
            :title="candidateTooltip(candidate)"
            @click="$emit('select', candidate.id)"
          >
            <strong class="candidate-title">{{ candidate.title || candidate.id }}</strong>
            <span
              v-if="candidate.content && normalized(candidate.content) !== normalized(candidate.title || '')"
              class="candidate-content"
            >{{ candidate.content }}</span>
            <span class="candidate-meta">
              <span v-if="candidate.updated">{{ formatUpdated(candidate.updated) }}</span>
              <code>{{ shortId(candidate.id) }}</code>
            </span>
            <span v-if="candidate.projectPath" class="candidate-path">{{ candidate.projectPath }}</span>
          </button>
        </li>
      </ul>
    </div>

    <p class="field-hint">{{ hint }}</p>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { NativeSessionCandidate, NativeSessionDiscoveryResult } from '@shared/native-session-candidates'

type DiscoveryStatus = NativeSessionDiscoveryResult['status'] | 'loading'

const props = withDefaults(defineProps<{
  modelValue: string
  title: string
  label: string
  hint: string
  placeholder: string
  inputId: string
  continueLast?: boolean
  showContinue?: boolean
  canPick?: boolean
  pickerOpen?: boolean
  status?: DiscoveryStatus
  statusMessage?: string
  candidates?: NativeSessionCandidate[]
  pickLabel: string
  closeLabel: string
  loadingLabel: string
  emptyLabel: string
  unsupportedLabel: string
  errorLabel: string
  retryLabel: string
  searchLabel: string
  searchPlaceholder: string
  searchEmptyLabel: string
  listLabel: string
  continueLabel: string
  conflictLabel: string
  autoSelectedLabel: string
  autoSelected?: boolean
  description?: string
}>(), {
  continueLast: false,
  showContinue: false,
  canPick: false,
  pickerOpen: false,
  status: 'empty',
  statusMessage: '',
  candidates: () => [],
  autoSelected: false,
  description: ''
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
  'update:continueLast': [value: boolean]
  'toggle-picker': []
  select: [id: string]
  retry: []
}>()

const searchQuery = ref('')
const panelId = computed(() => `${props.inputId}-candidate-panel`)
const searchId = computed(() => `${props.inputId}-candidate-search`)
const filteredCandidates = computed(() => {
  const query = normalized(searchQuery.value)
  if (!query) return props.candidates
  return props.candidates.filter((candidate) =>
    [candidate.title, candidate.content, candidate.id, candidate.projectPath]
      .some((value) => normalized(value || '').includes(query))
  )
})
const liveStatusText = computed(() => {
  if (!props.pickerOpen) return ''
  if (props.status === 'loading') return props.loadingLabel
  if (props.status === 'error') return props.statusMessage || props.errorLabel
  if (props.status === 'unsupported') return props.statusMessage || props.unsupportedLabel
  if (props.status === 'empty' || props.candidates.length === 0) return props.statusMessage || props.emptyLabel
  if (filteredCandidates.value.length === 0) return props.searchEmptyLabel
  return props.listLabel
})

watch(() => props.pickerOpen, (open) => {
  if (!open) searchQuery.value = ''
})

function normalized(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase()
}

function handleInput(event: Event): void {
  emit('update:modelValue', (event.target as HTMLInputElement).value)
}

function formatUpdated(updated: number): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(updated)
}

function shortId(id: string): string {
  if (id.length <= 14) return id
  return `${id.slice(0, 8)}…${id.slice(-4)}`
}

function candidateTooltip(candidate: NativeSessionCandidate): string {
  return [
    candidate.title || candidate.id,
    candidate.content && normalized(candidate.content) !== normalized(candidate.title || '') ? candidate.content : '',
    candidate.updated ? formatUpdated(candidate.updated) : '',
    candidate.id,
    candidate.projectPath || ''
  ].filter(Boolean).join('\n')
}
</script>

<style scoped lang="scss">
.resume-section {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
  padding: var(--spacing-sm);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  background: var(--bg-card);
}

.section-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--spacing-sm);
  margin-bottom: var(--spacing-xs);
}

h4 {
  margin: 0;
  color: var(--text-primary);
  font-size: var(--font-size-sm);
  font-weight: 650;
}

.section-description,
.field-hint,
.state-message {
  margin: 0;
  color: var(--text-muted);
  font-size: var(--font-size-xs);
  line-height: 1.4;
}

.section-description { margin-top: 2px; }
.field-label { color: var(--text-secondary); font-size: var(--font-size-xs); }

.resume-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: var(--spacing-xs);
  align-items: center;
}

.pick-button,
.retry-button {
  min-height: 32px;
  padding: 0 var(--spacing-sm);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  background: var(--bg-secondary);
  color: var(--text-secondary);
  cursor: pointer;
  font: inherit;
  font-size: var(--font-size-xs);
  white-space: nowrap;
}

.pick-button:hover,
.retry-button:hover {
  border-color: var(--border-light);
  background: var(--bg-hover);
  color: var(--text-primary);
}

.continue-label {
  display: inline-flex;
  align-items: center;
  gap: var(--spacing-xs);
  width: fit-content;
  color: var(--text-secondary);
  font-size: var(--font-size-xs);
}

.conflict-hint,
.state-block.error .state-message {
  margin: 0;
  color: var(--status-warning);
  font-size: var(--font-size-xs);
}

.picker-panel {
  max-height: 300px;
  overflow-y: auto;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  background: var(--bg-primary);
}

.search-row { position: sticky; top: 0; z-index: 1; padding: 8px; background: var(--bg-primary); }
.candidate-search { width: 100%; }
.state-message { padding: 12px; }
.state-block { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 8px 12px; }
.state-block .state-message { padding: 0; }

.candidate-list {
  display: flex;
  flex-direction: column;
  gap: 1px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.candidate-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  width: 100%;
  padding: 9px var(--spacing-sm);
  border: 0;
  border-left: 3px solid transparent;
  background: transparent;
  color: var(--text-primary);
  cursor: pointer;
  text-align: left;
  font: inherit;
}

.candidate-item:hover,
.candidate-item:focus-visible { outline: none; background: var(--bg-hover); }
.candidate-item.selected { border-left-color: var(--accent-primary); background: color-mix(in srgb, var(--accent-primary) 10%, transparent); }

.candidate-title,
.candidate-path,
.candidate-meta span,
.candidate-meta code {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.candidate-title { font-size: var(--font-size-sm); font-weight: 600; }
.candidate-content {
  display: -webkit-box;
  overflow: hidden;
  color: var(--text-secondary);
  font-size: var(--font-size-xs);
  line-height: 1.4;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.candidate-meta { display: flex; gap: 8px; color: var(--text-muted); font-size: var(--font-size-xs); }
.candidate-meta code { color: inherit; font-family: var(--font-mono); }
.candidate-path { color: var(--text-muted); font-family: var(--font-mono); font-size: 11px; }

.auto-badge {
  flex: 0 0 auto;
  padding: 2px 6px;
  border: 1px solid color-mix(in srgb, var(--status-success) 35%, var(--border-color));
  border-radius: 999px;
  color: var(--status-success);
  font-size: 11px;
  white-space: nowrap;
}

.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }

@media (max-width: 640px) {
  .resume-row { grid-template-columns: 1fr; }
  .pick-button { width: 100%; }
}
</style>
