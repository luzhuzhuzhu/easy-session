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
        :disabled="loading"
        @click="$emit('toggle-picker')"
      >
        {{ loading ? loadingLabel : pickLabel }}
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

    <div v-if="pickerOpen" class="picker-panel" aria-live="polite">
      <p v-if="loading" class="state-message">{{ loadingLabel }}</p>
      <p v-else-if="error" class="state-message error">{{ errorLabel }}</p>
      <p v-else-if="candidates.length === 0" class="state-message">{{ emptyLabel }}</p>
      <ul v-else class="candidate-list">
        <li v-for="candidate in candidates" :key="candidate.id">
          <button type="button" class="candidate-item" @click="$emit('select', candidate.id)">
            <strong>{{ candidate.title || candidate.id }}</strong>
            <span class="candidate-meta">
              <span>{{ candidate.id }}</span>
              <span v-if="candidate.content && candidate.content !== candidate.title" class="candidate-content">
                {{ candidate.content }}
              </span>
              <span v-if="candidate.projectPath">{{ candidate.projectPath }}</span>
              <span v-if="candidate.updated">{{ formatUpdated(candidate.updated) }}</span>
            </span>
          </button>
        </li>
      </ul>
    </div>

    <p class="field-hint">{{ hint }}</p>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'

interface Candidate {
  id: string
  title?: string
  content?: string
  updated?: number
  projectPath?: string
}

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
  loading?: boolean
  error?: boolean
  candidates?: Candidate[]
  pickLabel: string
  loadingLabel: string
  emptyLabel: string
  errorLabel: string
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
  loading: false,
  error: false,
  candidates: () => [],
  autoSelected: false,
  description: ''
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
  'update:continueLast': [value: boolean]
  'toggle-picker': []
  select: [id: string]
}>()

const title = computed(() => props.title)

function handleInput(event: Event): void {
  emit('update:modelValue', (event.target as HTMLInputElement).value)
}

function formatUpdated(updated: number): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'short', timeStyle: 'short' }).format(updated)
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

.section-description {
  margin-top: 2px;
}

.field-label {
  color: var(--text-secondary);
  font-size: var(--font-size-xs);
}

.resume-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: var(--spacing-xs);
  align-items: center;
}

.pick-button {
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

.pick-button:hover:not(:disabled) {
  border-color: var(--border-light);
  background: var(--bg-hover);
  color: var(--text-primary);
}

.pick-button:disabled {
  cursor: wait;
  opacity: 0.55;
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
.state-message.error {
  margin: 0;
  color: var(--status-warning);
  font-size: var(--font-size-xs);
}

.picker-panel {
  max-height: 220px;
  overflow-y: auto;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  background: var(--bg-primary);
}

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
  gap: 3px;
  width: 100%;
  padding: 8px var(--spacing-sm);
  border: 0;
  background: transparent;
  color: var(--text-primary);
  cursor: pointer;
  text-align: left;
  font: inherit;
}

.candidate-item:hover,
.candidate-item:focus-visible {
  outline: none;
  background: var(--bg-hover);
}

.candidate-item strong,
.candidate-meta span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.candidate-item strong {
  font-size: var(--font-size-sm);
  font-weight: 600;
}

.candidate-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  color: var(--text-muted);
  font-family: var(--font-mono);
  font-size: var(--font-size-xs);
}

.auto-badge {
  flex: 0 0 auto;
  padding: 2px 6px;
  border: 1px solid color-mix(in srgb, var(--status-success) 35%, var(--border-color));
  border-radius: 999px;
  color: var(--status-success);
  font-size: 11px;
  white-space: nowrap;
}

@media (max-width: 640px) {
  .resume-row {
    grid-template-columns: 1fr;
  }

  .pick-button {
    width: 100%;
  }
}
</style>
