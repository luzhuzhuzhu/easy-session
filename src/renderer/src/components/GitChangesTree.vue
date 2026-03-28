<template>
  <div class="git-changes-tree">
    <div v-if="message" class="tree-message">{{ message }}</div>
    <div v-else-if="!items.length" class="tree-message">{{ $t('inspector.emptyChanges') }}</div>
    <template v-else>
      <section v-if="stagedEntries.length" class="tree-group">
        <button class="tree-group-header tree-group-toggle" type="button" @click="toggleGroup('staged')">
          <TreeIcon :name="collapsedGroups.staged ? 'caret-collapsed' : 'caret-expanded'" :size="14" />
          <span class="tree-group-label tree-group-label--staged">{{ $t('inspector.staged') }}</span>
          <span class="tree-group-count">{{ stagedEntries.length }}</span>
        </button>
        <div v-if="!collapsedGroups.staged" class="tree-group-content">
          <VirtualTree :items="stagedVisibleNodes" :threshold="50" :item-height="28">
            <template #default="{ node }">
              <button
                v-if="node.kind === 'directory'"
                class="tree-item tree-item--directory"
                :style="rowStyle(node.depth)"
                type="button"
                @click="toggleDirectory('staged', node.path)"
              >
                <TreeIcon :name="isDirectoryCollapsed('staged', node.path) ? 'caret-collapsed' : 'caret-expanded'" :size="14" />
                <TreeIcon :name="isDirectoryCollapsed('staged', node.path) ? 'directory' : 'directory-open'" :size="14" />
                <span class="tree-item-path">{{ node.name }}</span>
              </button>
              <button
                v-else
                class="tree-item"
                :class="{ active: isSelected(node.item, 'staged') }"
                :style="rowStyle(node.depth)"
                type="button"
                @click="handleSelect(node.item, 'staged')"
              >
                <span class="tree-status-code staged" :class="node.item.status">{{ statusShort(node.item.status) }}</span>
                <TreeIcon class="tree-file-icon" :name="fileIconName(node.item.path)" :size="14" />
                <span class="tree-item-main">
                  <span class="tree-item-path">{{ node.name }}</span>
                  <span v-if="buildSecondaryLabel(node.item)" class="tree-item-secondary">{{ buildSecondaryLabel(node.item) }}</span>
                </span>
                <span class="tree-actions" @click.stop>
                  <button
                    class="tree-action-btn"
                    type="button"
                    :title="$t('inspector.unstageAction')"
                    @click="handleUnstage(node.item.path)"
                  >
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                      <path d="M12 8H4M7.5 4.5L4 8l3.5 3.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                  </button>
                </span>
              </button>
            </template>
          </VirtualTree>
        </div>
      </section>

      <section v-if="unstagedEntries.length" class="tree-group">
        <button class="tree-group-header tree-group-toggle" type="button" @click="toggleGroup('unstaged')">
          <TreeIcon :name="collapsedGroups.unstaged ? 'caret-collapsed' : 'caret-expanded'" :size="14" />
          <span class="tree-group-label">{{ $t('inspector.unstaged') }}</span>
          <span class="tree-group-count">{{ unstagedEntries.length }}</span>
        </button>
        <div v-if="!collapsedGroups.unstaged" class="tree-group-content">
          <VirtualTree :items="unstagedVisibleNodes" :threshold="50" :item-height="28">
            <template #default="{ node }">
              <button
                v-if="node.kind === 'directory'"
                class="tree-item tree-item--directory"
                :style="rowStyle(node.depth)"
                type="button"
                @click="toggleDirectory('unstaged', node.path)"
              >
                <TreeIcon :name="isDirectoryCollapsed('unstaged', node.path) ? 'caret-collapsed' : 'caret-expanded'" :size="14" />
                <TreeIcon :name="isDirectoryCollapsed('unstaged', node.path) ? 'directory' : 'directory-open'" :size="14" />
                <span class="tree-item-path">{{ node.name }}</span>
              </button>
              <button
                v-else
                class="tree-item"
                :class="{ active: isSelected(node.item, 'unstaged') }"
                :style="rowStyle(node.depth)"
                type="button"
                @click="handleSelect(node.item, 'unstaged')"
              >
                <span class="tree-status-code" :class="node.item.status">{{ statusShort(node.item.status) }}</span>
                <TreeIcon class="tree-file-icon" :name="fileIconName(node.item.path)" :size="14" />
                <span class="tree-item-main">
                  <span class="tree-item-path">{{ node.name }}</span>
                  <span v-if="buildSecondaryLabel(node.item)" class="tree-item-secondary">{{ buildSecondaryLabel(node.item) }}</span>
                </span>
                <span class="tree-actions" @click.stop>
                  <button
                    class="tree-action-btn"
                    type="button"
                    :title="$t('inspector.discardAction')"
                    @click="handleDiscard(node.item.path)"
                  >
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                      <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                    </svg>
                  </button>
                  <button
                    class="tree-action-btn primary"
                    type="button"
                    :title="$t('inspector.stageAction')"
                    @click="handleStage(node.item.path)"
                  >
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                      <path d="M4 8h8M8.5 4.5L12 8l-3.5 3.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                  </button>
                </span>
              </button>
            </template>
          </VirtualTree>
        </div>
      </section>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive } from 'vue'
import TreeIcon from '@/components/tree/TreeIcon.vue'
import VirtualTree from '@/components/tree/VirtualTree.vue'
import type { ProjectGitStatusItem } from '@/api/local-project'

defineOptions({ name: 'GitChangesTree' })

type GroupKey = 'staged' | 'unstaged'

interface ChangeTreeDirectoryNode {
  kind: 'directory'
  key: string
  path: string
  name: string
  children: Map<string, ChangeTreeNode>
}

interface ChangeTreeFileNode {
  kind: 'file'
  key: string
  path: string
  name: string
  item: ProjectGitStatusItem
}

type ChangeTreeNode = ChangeTreeDirectoryNode | ChangeTreeFileNode

interface VisibleDirectoryNode {
  kind: 'directory'
  key: string
  path: string
  name: string
  depth: number
}

interface VisibleFileNode {
  kind: 'file'
  key: string
  path: string
  name: string
  depth: number
  item: ProjectGitStatusItem
}

type VisibleTreeNode = VisibleDirectoryNode | VisibleFileNode

const props = defineProps<{
  items: ProjectGitStatusItem[]
  selectedRelativePath: string | null
  selectedViewMode?: 'staged' | 'unstaged' | 'auto'
  message?: string | null
}>()

const emit = defineEmits<{
  select: [payload: { relativePath: string; viewMode: 'staged' | 'unstaged' }]
  stage: [relativePath: string]
  unstage: [relativePath: string]
  discard: [relativePath: string]
}>()

const collapsedGroups = reactive<Record<GroupKey, boolean>>({
  staged: false,
  unstaged: false
})

const collapsedDirectories = reactive<Record<GroupKey, string[]>>({
  staged: [],
  unstaged: []
})

const stagedEntries = computed(() => {
  return props.items
    .filter((item) => item.staged)
    .sort((a, b) => a.path.localeCompare(b.path, 'zh-CN'))
})

const unstagedEntries = computed(() => {
  return props.items
    .filter((item) => !item.staged)
    .sort((a, b) => a.path.localeCompare(b.path, 'zh-CN'))
})

const stagedVisibleNodes = computed(() => flattenTree(buildTree(stagedEntries.value), 'staged'))
const unstagedVisibleNodes = computed(() => flattenTree(buildTree(unstagedEntries.value), 'unstaged'))

function buildTree(items: ProjectGitStatusItem[]): ChangeTreeNode[] {
  const root = new Map<string, ChangeTreeNode>()

  for (const item of items) {
    const segments = item.path.split('/').filter(Boolean)
    let cursor = root
    let currentPath = ''

    for (const [index, segment] of segments.entries()) {
      currentPath = currentPath ? `${currentPath}/${segment}` : segment
      const isLeaf = index === segments.length - 1

      if (isLeaf) {
        cursor.set(currentPath, {
          kind: 'file',
          key: `file:${item.staged ? 'staged' : 'unstaged'}:${currentPath}`,
          path: currentPath,
          name: segment,
          item
        })
        continue
      }

      const existing = cursor.get(currentPath)
      if (existing?.kind === 'directory') {
        cursor = existing.children
        continue
      }

      const directoryNode: ChangeTreeDirectoryNode = {
        kind: 'directory',
        key: `dir:${item.staged ? 'staged' : 'unstaged'}:${currentPath}`,
        path: currentPath,
        name: segment,
        children: new Map<string, ChangeTreeNode>()
      }
      cursor.set(currentPath, directoryNode)
      cursor = directoryNode.children
    }
  }

  return sortTreeNodes(Array.from(root.values()))
}

function sortTreeNodes(nodes: ChangeTreeNode[]): ChangeTreeNode[] {
  return nodes
    .sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === 'directory' ? -1 : 1
      return a.name.localeCompare(b.name, 'zh-CN')
    })
    .map((node) => {
      if (node.kind === 'directory') {
        return {
          ...node,
          children: new Map(sortTreeNodes(Array.from(node.children.values())).map((child) => [child.path, child]))
        }
      }
      return node
    })
}

function flattenTree(nodes: ChangeTreeNode[], group: GroupKey, depth = 0): VisibleTreeNode[] {
  if (depth > 24) return []

  const visible: VisibleTreeNode[] = []

  for (const node of nodes) {
    if (node.kind === 'directory') {
      visible.push({
        kind: 'directory',
        key: node.key,
        path: node.path,
        name: node.name,
        depth
      })
      if (!isDirectoryCollapsed(group, node.path)) {
        const children = flattenTree(Array.from(node.children.values()), group, depth + 1)
        visible.push(...children)
      }
      continue
    }

    visible.push({
      kind: 'file',
      key: node.key,
      path: node.path,
      name: node.name,
      depth,
      item: node.item
    })
  }

  return visible
}

function statusShort(status: ProjectGitStatusItem['status']): string {
  if (status === 'modified') return 'M'
  if (status === 'added') return 'A'
  if (status === 'deleted') return 'D'
  if (status === 'renamed') return 'R'
  if (status === 'untracked') return 'U'
  if (status === 'copied') return 'C'
  if (status === 'conflicted') return '!'
  return '?'
}

function isSelected(item: ProjectGitStatusItem, viewMode: 'staged' | 'unstaged'): boolean {
  return props.selectedRelativePath === item.path && props.selectedViewMode === viewMode
}

function isDirectoryCollapsed(group: GroupKey, path: string): boolean {
  return collapsedDirectories[group].includes(path)
}

function toggleGroup(group: GroupKey): void {
  collapsedGroups[group] = !collapsedGroups[group]
}

function toggleDirectory(group: GroupKey, path: string): void {
  if (isDirectoryCollapsed(group, path)) {
    collapsedDirectories[group] = collapsedDirectories[group].filter((item) => item !== path)
    return
  }
  collapsedDirectories[group] = [...collapsedDirectories[group], path]
}

function handleSelect(item: ProjectGitStatusItem, viewMode: 'staged' | 'unstaged'): void {
  emit('select', { relativePath: item.path, viewMode })
}

function handleStage(path: string): void {
  emit('stage', path)
}

function handleUnstage(path: string): void {
  emit('unstage', path)
}

function handleDiscard(path: string): void {
  emit('discard', path)
}

function fileIconName(path: string): 'file' | 'file-md' | 'file-ts' | 'file-json' | 'file-image' {
  const extension = path.split('.').pop()?.toLowerCase() ?? ''
  if (['md', 'markdown', 'mdx', 'mdown'].includes(extension)) return 'file-md'
  if (['ts', 'tsx', 'js', 'jsx'].includes(extension)) return 'file-ts'
  if (['json', 'jsonc', 'json5'].includes(extension)) return 'file-json'
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico'].includes(extension)) return 'file-image'
  return 'file'
}

function buildSecondaryLabel(item: ProjectGitStatusItem): string {
  if (item.previousPath) {
    return `${item.previousPath} → ${item.path}`
  }
  return ''
}

function rowStyle(depth: number): Record<string, string> {
  return {
    paddingLeft: `${12 + depth * 14}px`
  }
}
</script>

<style scoped lang="scss">
@use '../assets/styles/tree-styles.scss' as tree;

.git-changes-tree {
  height: 100%;
  min-height: 0;
  overflow: auto;
  display: flex;
  flex-direction: column;
}

.tree-message {
  @include tree.tree-message;
}

.tree-group + .tree-group {
  border-top: 1px solid var(--border-color);
}

.tree-group {
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  background: color-mix(in srgb, var(--bg-secondary) 86%, var(--bg-primary) 14%);
}

.tree-group-header {
  @include tree.tree-group-header;
  flex-shrink: 0;
}

.tree-group-toggle {
  @include tree.tree-group-toggle;
}

.tree-group-label {
  @include tree.tree-group-label;
}

.tree-group-label--staged {
  @include tree.tree-group-label--staged;
}

.tree-group-count {
  @include tree.tree-group-count;
}

.tree-group-content {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}

.tree-item {
  @include tree.tree-item;

  grid-template-columns: 16px 16px minmax(0, 1fr) auto;
}

.tree-item--directory {
  @include tree.tree-item--directory;
}

.tree-status-code {
  @include tree.tree-status-code;
}

.tree-item-path {
  @include tree.tree-item-path;
}

.tree-item-secondary {
  @include tree.tree-item-secondary;
}

.tree-item-main {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.tree-file-icon {
  color: var(--text-muted);
}

.tree-actions {
  @include tree.tree-actions;
}

.tree-action-btn {
  @include tree.tree-action-btn;
}

.tree-item:hover .tree-actions,
.tree-item.active .tree-actions {
  opacity: 1;
}
</style>
