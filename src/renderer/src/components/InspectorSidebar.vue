<template>
  <section
    class="panel-sidebar"
    :class="{ compact, collapsed: !expanded }"
    @pointerenter="emit('pointer-enter')"
    @pointerleave="emit('pointer-leave')"
  >
    <div class="sidebar-scroll">
      <GitChangesTree
        v-if="activeTab === 'changes'"
        :items="gitStatusItems"
        :selected-relative-path="selectedRelativePath"
        :selected-view-mode="selectedViewMode"
        :message="changesMessage"
        @select="emit('select-change', $event)"
        @stage="emit('stage', $event)"
        @unstage="emit('unstage', $event)"
        @discard="emit('discard', $event)"
      />

      <div v-else class="files-wrap">
        <div v-if="loadingRoot" class="tree-message">{{ $t('inspector.loading') }}</div>
        <div
          v-else-if="!Object.keys(treeIndex).length"
          class="tree-message"
        >
          {{ $t('inspector.emptyFiles') }}
        </div>
        <ProjectFilesTree
          v-else
          :tree-index="treeIndex"
          :loading-directories="loadingDirectories"
          :expanded-paths="expandedPaths"
          :selected-relative-path="selectedRelativePath"
          @toggle-directory="emit('toggle-directory', $event)"
          @select-file="emit('select-file', $event)"
        />
      </div>
    </div>
    <div
      v-if="expanded"
      class="sidebar-resize-handle"
      :class="{ compact }"
      @pointerdown="emit('start-resize', $event)"
    />
  </section>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import GitChangesTree from '@/components/GitChangesTree.vue'
import ProjectFilesTree from '@/components/ProjectFilesTree.vue'
import type { ProjectFileTreeEntry, ProjectGitStatusItem } from '@/api/local-project'
import type { InspectorTab } from '@/features/inspector/types'

defineProps<{
  activeTab: InspectorTab
  compact: boolean
  expanded: boolean
  gitStatusItems: ProjectGitStatusItem[]
  selectedRelativePath: string | null
  selectedViewMode: 'staged' | 'unstaged' | 'auto'
  changesMessage: string | null
  loadingRoot: boolean
  treeIndex: Record<string, ProjectFileTreeEntry[]>
  loadingDirectories: Record<string, boolean>
  expandedPaths: string[]
}>()

const emit = defineEmits<{
  'pointer-enter': []
  'pointer-leave': []
  'select-change': [payload: { relativePath: string; viewMode: 'staged' | 'unstaged' }]
  stage: [relativePath: string]
  unstage: [relativePath: string]
  discard: [relativePath: string]
  'toggle-directory': [relativePath: string]
  'select-file': [relativePath: string]
  'start-resize': [event: PointerEvent]
}>()

useI18n()
</script>

<style scoped lang="scss">
.panel-sidebar {
  min-width: 0;
  min-height: 0;
  border-right: 1px solid var(--border-color);
  background: var(--bg-secondary);
  overflow: hidden;
  position: relative;
  transition:
    border-color 330ms ease,
    opacity 330ms ease;
}

.sidebar-scroll {
  height: 100%;
  min-height: 0;
  overflow: auto;
}

.files-wrap {
  height: 100%;
  overflow: auto;
}

.tree-message {
  padding: 14px 16px;
  color: var(--text-muted);
  font-size: var(--font-size-sm);
}

.sidebar-resize-handle {
  position: absolute;
  top: 0;
  right: -5px;
  width: 10px;
  height: 100%;
  cursor: col-resize;
  z-index: 3;

  &::after {
    content: '';
    position: absolute;
    top: 10px;
    bottom: 10px;
    left: 50%;
    width: 2px;
    transform: translateX(-50%);
    background: color-mix(in srgb, var(--border-color) 82%, var(--bg-primary) 18%);
    transition: background 140ms ease;
  }

  &:hover::after {
    background: color-mix(in srgb, var(--accent-primary) 42%, var(--border-color) 58%);
  }
}

.sidebar-resize-handle.compact {
  top: auto;
  right: auto;
  left: 0;
  bottom: -5px;
  width: 100%;
  height: 10px;
  cursor: row-resize;

  &::after {
    top: 50%;
    bottom: auto;
    left: 10px;
    right: 10px;
    width: auto;
    height: 2px;
    transform: translateY(-50%);
  }
}

.panel-sidebar.collapsed {
  border-color: transparent;
  opacity: 0.96;
}

.compact.panel-sidebar {
  border-right: none;
  border-bottom: 1px solid var(--border-color);
}
</style>
