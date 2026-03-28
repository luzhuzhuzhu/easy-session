<template>
  <div class="git-branch-select" @pointerenter="handlePointerEnter" @pointerleave="handlePointerLeave">
    <button
      ref="triggerRef"
      class="branch-trigger"
      :class="{ loading: loading, open: isOpen }"
      type="button"
      :disabled="loading"
      @click="toggleDropdown"
    >
      <svg class="branch-icon" width="14" height="14" viewBox="0 0 16 16" fill="none">
        <path d="M4 4v8M4 8c0-2 1-3 3-3h2c2 0 3-1 3-3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        <circle cx="4" cy="4" r="1.5" fill="currentColor"/>
        <circle cx="12" cy="2" r="1.5" fill="currentColor"/>
        <circle cx="4" cy="12" r="1.5" fill="currentColor"/>
      </svg>
      <span class="branch-name">{{ displayBranchName }}</span>
    </button>
    <Teleport to="body">
      <div
        v-if="isOpen"
        ref="dropdownRef"
        class="branch-dropdown"
        :style="dropdownStyle"
        @click.stop
      >
        <div class="dropdown-header">
          <span class="dropdown-title">{{ $t('inspector.branches.title') }}</span>
        </div>
        <div class="dropdown-list">
          <button
            v-for="branch in localBranches"
            :key="branch.name"
            class="branch-item"
            :class="{
              current: branch.isCurrent,
              viewed: branch.name === props.viewedBranch
            }"
            type="button"
            @click="handleBranchClick(branch)"
          >
            <svg class="item-icon" width="12" height="12" viewBox="0 0 16 16" fill="none">
              <path d="M4 4v8M4 8c0-2 1-3 3-3h2c2 0 3-1 3-3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
              <circle cx="4" cy="4" r="1.5" fill="currentColor"/>
              <circle cx="12" cy="2" r="1.5" fill="currentColor"/>
              <circle cx="4" cy="12" r="1.5" fill="currentColor"/>
            </svg>
            <span class="item-name">{{ branch.name }}</span>
            <span v-if="branch.name === props.viewedBranch" class="item-badge viewed-badge">
              {{ $t('inspector.branches.viewing') }}
            </span>
            <span v-else-if="branch.isCurrent" class="item-badge current-badge">
              {{ $t('inspector.branches.currentBranch') }}
            </span>
            <span v-if="branch.ahead > 0 || branch.behind > 0" class="item-sync">
              <span v-if="branch.ahead > 0">↑{{ branch.ahead }}</span>
              <span v-if="branch.behind > 0">↓{{ branch.behind }}</span>
            </span>
            <svg
              v-if="branch.name === props.viewedBranch"
              class="check-icon viewed-check"
              width="12"
              height="12"
              viewBox="0 0 16 16"
              fill="none"
            >
              <path d="M3 8l3 3 7-7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            <svg
              v-else-if="branch.isCurrent"
              class="check-icon current-check"
              width="12"
              height="12"
              viewBox="0 0 16 16"
              fill="none"
            >
              <path d="M3 8l3 3 7-7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
          <div v-if="remoteBranches.length > 0" class="dropdown-divider">
            <span>{{ $t('inspector.branches.remoteBranches') }}</span>
          </div>
          <button
            v-for="branch in remoteBranches"
            :key="branch.name"
            class="branch-item remote"
            :class="{ viewed: branch.name === props.viewedBranch }"
            type="button"
            @click="handleBranchClick(branch)"
          >
            <svg class="item-icon" width="12" height="12" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="8" r="5" stroke="currentColor" stroke-width="1.5"/>
              <path d="M8 3v10M3 8h10" stroke="currentColor" stroke-width="1.5"/>
            </svg>
            <span class="item-name">{{ branch.name }}</span>
            <span v-if="branch.name === props.viewedBranch" class="item-badge viewed-badge">
              {{ $t('inspector.branches.viewing') }}
            </span>
            <svg
              v-if="branch.name === props.viewedBranch"
              class="check-icon viewed-check"
              width="12"
              height="12"
              viewBox="0 0 16 16"
              fill="none"
            >
              <path d="M3 8l3 3 7-7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { ProjectGitBranchItem } from '@/api/local-project'

defineOptions({ name: 'GitBranchSelect' })

const props = defineProps<{
  currentBranch: string | null
  viewedBranch: string | null
  branches: ProjectGitBranchItem[]
  loading: boolean
}>()

const emit = defineEmits<{
  selectBranch: [branchName: string]
}>()

const triggerRef = ref<HTMLElement | null>(null)
const dropdownRef = ref<HTMLElement | null>(null)
const isOpen = ref(false)
const dropdownStyle = ref<Record<string, string>>({})

const displayBranchName = computed(() => props.viewedBranch || props.currentBranch || '--')

const currentBranchItem = computed(() => props.branches.find((b) => b.isCurrent))

const localBranches = computed(() => props.branches.filter((b) => !b.isRemote))

const remoteBranches = computed(() => props.branches.filter((b) => b.isRemote))

function toggleDropdown(): void {
  if (isOpen.value) {
    closeDropdown()
  } else {
    openDropdown()
  }
}

function openDropdown(): void {
  isOpen.value = true
  updateDropdownPosition()
}

function closeDropdown(): void {
  isOpen.value = false
}

function updateDropdownPosition(): void {
  const trigger = triggerRef.value
  if (!trigger) return

  const rect = trigger.getBoundingClientRect()
  dropdownStyle.value = {
    position: 'fixed',
    top: `${rect.bottom + 4}px`,
    left: `${rect.left}px`,
    minWidth: `${Math.max(rect.width, 200)}px`
  }
}

function handleBranchClick(branch: ProjectGitBranchItem): void {
  emit('selectBranch', branch.name)
  closeDropdown()
}

function handlePointerEnter(): void {}

function handlePointerLeave(): void {}

function handleClickOutside(event: MouseEvent): void {
  if (!isOpen.value) return

  const trigger = triggerRef.value
  const dropdown = dropdownRef.value

  if (
    trigger &&
    !trigger.contains(event.target as Node) &&
    dropdown &&
    !dropdown.contains(event.target as Node)
  ) {
    closeDropdown()
  }
}

function handleEscape(event: KeyboardEvent): void {
  if (event.key === 'Escape' && isOpen.value) {
    closeDropdown()
  }
}

watch(
  () => [props.currentBranch, props.viewedBranch],
  () => {
    if (isOpen.value) {
      updateDropdownPosition()
    }
  }
)

onMounted(() => {
  document.addEventListener('click', handleClickOutside)
  document.addEventListener('keydown', handleEscape)
})

onBeforeUnmount(() => {
  document.removeEventListener('click', handleClickOutside)
  document.removeEventListener('keydown', handleEscape)
})
</script>

<style scoped lang="scss">
.git-branch-select {
  position: relative;
  flex-shrink: 0;
}

.branch-trigger {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 24px;
  padding: 0 8px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: var(--bg-tertiary);
  color: var(--text-primary);
  font-size: 12px;
  cursor: pointer;
  transition: all 140ms ease;

  &:hover:not(:disabled) {
    background: var(--bg-hover);
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  &.open {
    border-color: var(--accent-primary);
  }
}

.branch-icon {
  color: var(--text-secondary);
  flex-shrink: 0;
}

.branch-name {
  max-width: 120px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.branch-dropdown {
  z-index: 1000;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: var(--bg-secondary);
  box-shadow: var(--shadow-lg);
  overflow: hidden;
}

.dropdown-header {
  padding: 8px 12px;
  border-bottom: 1px solid var(--border-color);
  background: var(--bg-tertiary);
}

.dropdown-title {
  font-size: 11px;
  font-weight: 700;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.dropdown-list {
  max-height: 300px;
  overflow-y: auto;
}

.branch-item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border: none;
  background: transparent;
  color: var(--text-primary);
  font-size: 12px;
  text-align: left;
  cursor: pointer;

  &:hover {
    background: var(--bg-hover);
  }

  &.current {
    .item-name {
      color: var(--accent-primary);
    }
  }

  &.viewed {
    background: color-mix(in srgb, var(--bg-hover) 70%, var(--accent-primary) 12%);
  }

  &.remote {
    .item-name {
      color: var(--text-secondary);
    }
  }
}

.item-icon {
  flex-shrink: 0;
  color: var(--text-muted);
}

.item-name {
  flex: 1;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.item-sync {
  display: flex;
  gap: 4px;
  font-size: 10px;
  font-family: var(--font-mono);
  color: var(--text-muted);
}

.item-badge {
  flex-shrink: 0;
  padding: 1px 5px;
  border: 1px solid var(--border-color);
  border-radius: 999px;
  background: var(--bg-tertiary);
  color: var(--text-secondary);
  font-size: 10px;
  line-height: 1.3;
}

.viewed-badge {
  color: var(--accent-primary);
  border-color: color-mix(in srgb, var(--accent-primary) 34%, var(--border-color) 66%);
  background: color-mix(in srgb, var(--bg-tertiary) 82%, var(--accent-primary) 18%);
}

.check-icon {
  flex-shrink: 0;
}

.viewed-check {
  color: var(--accent-primary);
}

.current-check {
  color: var(--text-muted);
}

.dropdown-divider {
  padding: 6px 12px;
  border-top: 1px solid var(--border-color);
  font-size: 10px;
  font-weight: 700;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
</style>
