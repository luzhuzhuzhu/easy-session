<template>
  <div class="git-branch-select" @pointerenter="handlePointerEnter" @pointerleave="handlePointerLeave">
    <button
      ref="triggerRef"
      class="branch-trigger"
      :class="{ loading: loading, open: isOpen }"
      type="button"
      :disabled="loading"
      @click="toggleDropdown"
      @keydown.arrow-down.prevent="openDropdown"
    >
      <UiIcon class="branch-icon" name="branch" />
      <span class="branch-name">{{ displayBranchName }}</span>
    </button>
    <Teleport to="body">
      <div
        v-if="isOpen"
        ref="dropdownRef"
        class="branch-dropdown"
        role="menu"
        tabindex="-1"
        :style="dropdownStyle"
        @click.stop
        @keydown="handleDropdownKeydown"
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
            role="menuitem"
            @click="handleBranchClick(branch)"
          >
            <UiIcon class="item-icon" name="branch" />
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
            <UiIcon
              v-if="branch.name === props.viewedBranch"
              class="check-icon viewed-check"
              name="check"
            />
            <UiIcon
              v-else-if="branch.isCurrent"
              class="check-icon current-check"
              name="check"
            />
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
            role="menuitem"
            @click="handleBranchClick(branch)"
          >
            <UiIcon class="item-icon" name="globe" />
            <span class="item-name">{{ branch.name }}</span>
            <span v-if="branch.name === props.viewedBranch" class="item-badge viewed-badge">
              {{ $t('inspector.branches.viewing') }}
            </span>
            <UiIcon
              v-if="branch.name === props.viewedBranch"
              class="check-icon viewed-check"
              name="check"
            />
          </button>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { ProjectGitBranchItem } from '@/api/local-project'
import { useMenuKeyboard } from '@/composables/useMenuKeyboard'
import UiIcon from '@/components/ui/UiIcon.vue'

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
const { handleMenuKeydown: handleDropdownKeydown } = useMenuKeyboard({
  menuRef: dropdownRef,
  isOpen: () => isOpen.value,
  onClose: () => closeDropdown(true),
  itemSelector: '.branch-item:not(:disabled)'
})

const displayBranchName = computed(() => props.viewedBranch || props.currentBranch || '--')

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

function closeDropdown(restoreFocus = false): void {
  isOpen.value = false
  if (restoreFocus) {
    triggerRef.value?.focus({ preventScroll: true })
  }
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
})

onBeforeUnmount(() => {
  document.removeEventListener('click', handleClickOutside)
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
  width: 14px;
  height: 14px;
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

  &:focus-visible {
    outline: 2px solid var(--accent-primary);
    outline-offset: -2px;
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
  width: 12px;
  height: 12px;
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
  border-radius: var(--radius-xs);
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
  width: 12px;
  height: 12px;
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
