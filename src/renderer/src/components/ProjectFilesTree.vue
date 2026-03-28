<template>
  <div class="project-files-tree">
    <template v-if="entries.length">
      <template v-for="entry in entries" :key="entry.relativePath">
        <button
          class="tree-item"
          :class="{
            'tree-item--directory': entry.kind === 'directory',
            active: selectedRelativePath === entry.relativePath
          }"
          :style="{ paddingLeft: `${12 + depth * 14}px` }"
          type="button"
          @click="handleEntryClick(entry)"
        >
          <template v-if="entry.kind === 'directory'">
            <TreeIcon
              :name="isExpanded(entry.relativePath) ? 'caret-expanded' : 'caret-collapsed'"
              :size="14"
            />
            <TreeIcon name="directory" :size="14" />
          </template>
          <TreeIcon
            v-else
            :name="getFileIcon(entry.name)"
            :size="14"
          />
          <span class="tree-item-path">{{ entry.name }}</span>
        </button>

        <div
          v-if="entry.kind === 'directory' && isExpanded(entry.relativePath) && isLoading(entry.relativePath)"
          class="tree-loading"
          :style="{ paddingLeft: `${26 + depth * 14}px` }"
        >
          <TreeIcon name="spinner" :size="14" />
          <span>{{ $t('inspector.loading') }}</span>
        </div>
        <ProjectFilesTree
          v-else-if="entry.kind === 'directory' && isExpanded(entry.relativePath)"
          :tree-index="treeIndex"
          :loading-directories="loadingDirectories"
          :parent-path="entry.relativePath"
          :depth="depth + 1"
          :expanded-paths="expandedPaths"
          :selected-relative-path="selectedRelativePath"
          @toggle-directory="$emit('toggle-directory', $event)"
          @select-file="$emit('select-file', $event)"
        />
      </template>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import TreeIcon from '@/components/tree/TreeIcon.vue'
import type { ProjectFileTreeEntry } from '@/api/local-project'

defineOptions({ name: 'ProjectFilesTree' })

const props = withDefaults(defineProps<{
  treeIndex: Record<string, ProjectFileTreeEntry[]>
  loadingDirectories: Record<string, boolean>
  parentPath?: string
  depth?: number
  expandedPaths: string[]
  selectedRelativePath: string | null
}>(), {
  parentPath: '',
  depth: 0
})

const emit = defineEmits<{
  'toggle-directory': [relativePath: string]
  'select-file': [relativePath: string]
}>()

const entries = computed(() => props.treeIndex[props.parentPath] ?? [])

function isExpanded(relativePath: string): boolean {
  return props.expandedPaths.includes(relativePath)
}

function isLoading(relativePath: string): boolean {
  return Boolean(props.loadingDirectories[relativePath])
}

function handleEntryClick(entry: ProjectFileTreeEntry): void {
  if (entry.kind === 'directory') {
    emit('toggle-directory', entry.relativePath)
    return
  }
  emit('select-file', entry.relativePath)
}

function getFileIcon(filename: string): 'file-md' | 'file-ts' | 'file-json' | 'file-image' | 'file' {
  const ext = filename.split('.').pop()?.toLowerCase()
  if (ext === 'md' || ext === 'markdown') return 'file-md'
  if (ext === 'ts' || ext === 'tsx') return 'file-ts'
  if (ext === 'json' || ext === 'jsonc') return 'file-json'
  if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico'].includes(ext ?? '')) return 'file-image'
  return 'file'
}
</script>

<style scoped lang="scss">
@use '../assets/styles/tree-styles.scss' as tree;

.project-files-tree {
  display: flex;
  flex-direction: column;
}

.tree-item {
  @include tree.tree-item;
}

.tree-item:not(.tree-item--directory) {
  grid-template-columns: 16px minmax(0, 1fr);
}

.tree-item--directory {
  grid-template-columns: 16px 16px minmax(0, 1fr) !important;
  background: color-mix(in srgb, var(--bg-primary) 78%, transparent);
  color: var(--text-secondary);

  .tree-item-path {
    font-weight: 600;
  }
}

.tree-item-path {
  @include tree.tree-item-path;
}

.tree-loading {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px 6px 26px;
  color: var(--text-muted);
  font-size: 11px;
  border-top: 1px solid color-mix(in srgb, var(--border-color) 58%, transparent);
}
</style>