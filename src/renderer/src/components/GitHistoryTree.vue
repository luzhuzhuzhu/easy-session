<template>
  <div class="git-history-graph" v-bind="rootAttrs" @scroll="handleScroll">
    <div v-if="message" class="tree-message">{{ message }}</div>
    <div v-else-if="loading && !commits.length" class="tree-message">{{ $t('inspector.loading') }}</div>
    <div v-else-if="!commits.length" class="tree-message">{{ $t('inspector.history.emptyHistory') }}</div>
    <template v-else>
      <VirtualTree :items="normalizedCommitItems" :threshold="50" :item-height="24">
        <template #default="{ node }">
          <div
            class="commit-row"
            :class="[{ selected: selectedHash === node.hash }, `kind-${node.kind}`]"
            :style="buildRowStyle(node)"
            @pointerenter="handleRowPointerEnter($event, node)"
            @pointermove="handleRowPointerMove($event)"
            @pointerleave="handleRowPointerLeave"
            @click="handleSelect(node)"
          >
            <div class="commit-graph-stage">
              <svg :width="graphCanvasWidth" :height="ROW_HEIGHT" class="graph-svg">
                <g v-for="(element, index) in buildGraphElements(node)" :key="`${node.hash}-${index}`">
                  <line
                    v-if="element.type === 'line'"
                    :x1="element.x1"
                    :y1="element.y1"
                    :x2="element.x2"
                    :y2="element.y2"
                    :stroke="element.color"
                    :stroke-width="LINE_STROKE_WIDTH"
                    stroke-linecap="round"
                  />
                  <path
                    v-else-if="element.type === 'path'"
                    :d="element.d"
                    :stroke="element.color"
                    :stroke-width="LINE_STROKE_WIDTH"
                    fill="none"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  />
                  <circle
                    v-else
                    :cx="element.cx"
                    :cy="element.cy"
                    :r="element.r"
                    :fill="element.fill"
                    :stroke="element.stroke"
                    :stroke-width="element.strokeWidth"
                    :stroke-dasharray="element.dashArray"
                  />
                </g>
              </svg>
              <div class="commit-chip">
                <div class="commit-info">
                  <span class="commit-subject">{{ getCommitSubject(node) }}</span>
                  <span v-if="node.refs.length" class="commit-refs">
                    <span
                      v-for="ref in node.refs.slice(0, 4)"
                      :key="ref"
                      class="ref-badge"
                      :class="getRefClass(ref)"
                    >
                      {{ formatRef(ref) }}
                    </span>
                    <span v-if="node.refs.length > 4" class="ref-badge ref-more">
                      +{{ node.refs.length - 4 }}
                    </span>
                  </span>
                </div>
              </div>
            </div>
          </div>
        </template>
      </VirtualTree>
      <div v-if="hasMore" class="load-more">
        <button
          class="load-more-btn"
          type="button"
          :disabled="loading"
          @click="$emit('loadMore')"
        >
          {{ loading ? $t('inspector.loading') : $t('inspector.history.loadMore') }}
        </button>
      </div>
    </template>
  </div>
  <Teleport to="body">
    <div
      v-if="hoveredCommit"
      class="history-hover-card"
      :style="hoverCardStyle"
      @pointerenter="hoverCardHovered = true"
      @pointerleave="handleHoverCardLeave"
    >
      <div class="hover-card-title">{{ getHoverTitle(hoveredCommit) }}</div>
      <div class="hover-card-meta">
        <span>{{ $t('inspector.history.source') }}: {{ getCommitSource(hoveredCommit) }}</span>
        <span>{{ $t('inspector.history.when') }}: {{ getCommitWhen(hoveredCommit) }}</span>
      </div>
      <div v-if="hoveredCommit.shortHash" class="hover-card-line">
        <span class="hover-card-label">{{ $t('inspector.history.hash') }}</span>
        <code>{{ hoveredCommit.shortHash }}</code>
      </div>
      <div v-if="hoveredCommit.refs.length" class="hover-card-line refs">
        <span class="hover-card-label">{{ $t('inspector.history.refs') }}</span>
        <span class="hover-card-refs">
          <span
            v-for="ref in hoveredCommit.refs"
            :key="ref"
            class="ref-badge"
            :class="getRefClass(ref)"
          >
            {{ formatRef(ref) }}
          </span>
        </span>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, ref, useAttrs } from 'vue'
import { useI18n } from 'vue-i18n'
import VirtualTree from '@/components/tree/VirtualTree.vue'
import type { ProjectGitCommitItem, ProjectGitSwimlane } from '@/api/local-project'

defineOptions({
  name: 'GitHistoryTree',
  inheritAttrs: false
})

const props = defineProps<{
  commits: ProjectGitCommitItem[]
  hasMore: boolean
  loading: boolean
  selectedHash?: string | null
  message?: string | null
}>()

const emit = defineEmits<{
  select: [commit: ProjectGitCommitItem]
  loadMore: []
}>()

const { t } = useI18n()
const rootAttrs = useAttrs()
const hoveredCommit = ref<ProjectGitCommitItem | null>(null)
const hoverCardStyle = ref<Record<string, string>>({})
const hoverCardHovered = ref(false)
let hoverLeaveTimer: number | null = null

const ROW_HEIGHT = 24
const SWIMLANE_WIDTH = 11
const GRAPH_PADDING_X = 12
const NODE_RADIUS = 4
const NODE_INNER_RADIUS = 2.25
const LINE_STROKE_WIDTH = 2
const GRAPH_MIN_WIDTH = 84

const paletteColors = ['#df6d6d', '#5a91df', '#71a86a', '#c78c54', '#8e75c7']

interface LineElement {
  type: 'line'
  x1: number
  y1: number
  x2: number
  y2: number
  color: string
}

interface PathElement {
  type: 'path'
  d: string
  color: string
}

interface CircleElement {
  type: 'circle'
  cx: number
  cy: number
  r: number
  fill: string
  stroke: string
  strokeWidth: number
  dashArray?: string
}

type GraphElement = LineElement | PathElement | CircleElement

const normalizedCommits = computed(() =>
  props.commits.map((commit) => ({
    ...commit,
    refs: Array.isArray(commit.refs) ? commit.refs : [],
    inputSwimlanes: Array.isArray(commit.inputSwimlanes) ? commit.inputSwimlanes : [],
    outputSwimlanes: Array.isArray(commit.outputSwimlanes) ? commit.outputSwimlanes : [],
    circleLaneIndex: typeof commit.circleLaneIndex === 'number' ? commit.circleLaneIndex : 0,
    graphWidth: Math.max(commit.graphWidth || 1, 1)
  }))
)

const normalizedCommitItems = computed(() =>
  normalizedCommits.value.map((commit) => ({
    ...commit,
    key: commit.hash
  }))
)

const graphColumnWidth = computed(() => {
  const widestLaneCount = normalizedCommits.value.reduce((maxWidth, commit) => Math.max(maxWidth, commit.graphWidth || 1), 1)
  return Math.max(GRAPH_MIN_WIDTH, GRAPH_PADDING_X * 2 + widestLaneCount * SWIMLANE_WIDTH)
})

const graphCanvasWidth = computed(() => Math.max(graphColumnWidth.value + 180, 340))

function laneCenter(index: number): number {
  return GRAPH_PADDING_X + SWIMLANE_WIDTH * index + SWIMLANE_WIDTH / 2
}

function buildRowStyle(commit: ProjectGitCommitItem): Record<string, string> {
  const safeCircleLaneIndex = Math.max(0, commit.circleLaneIndex || 0)
  const anchorX = laneCenter(safeCircleLaneIndex)
  return {
    '--graph-canvas-width': `${graphCanvasWidth.value}px`,
    '--graph-anchor-x': `${anchorX}px`,
    '--graph-content-left': `${anchorX + 18}px`
  }
}

function resolveLaneColor(lane: ProjectGitSwimlane): string {
  if (lane.refType === 'local') return 'var(--accent-primary)'
  if (lane.refType === 'remote') return 'var(--accent-secondary)'
  if (lane.refType === 'base') return 'var(--warning-color)'

  const paletteIndex = Number.parseInt(lane.colorKey.split(':')[1] ?? '0', 10)
  return paletteColors[((Number.isNaN(paletteIndex) ? 0 : paletteIndex) + paletteColors.length) % paletteColors.length]
}

function buildCurvePath(startX: number, endX: number): string {
  const centerY = ROW_HEIGHT / 2
  return `M ${startX} ${centerY} C ${startX} ${centerY + 4}, ${endX} ${ROW_HEIGHT - 4}, ${endX} ${ROW_HEIGHT}`
}

function buildLaneTransitionPath(startX: number, endX: number, startY: number, endY: number): string {
  const controlY = (startY + endY) / 2
  return `M ${startX} ${startY} C ${startX} ${controlY}, ${endX} ${controlY}, ${endX} ${endY}`
}

function buildGraphElements(commit: ProjectGitCommitItem): GraphElement[] {
  const elements: GraphElement[] = []
  const centerY = ROW_HEIGHT / 2
  const inputIndexByLaneId = new Map<string, number>()
  const outputIndexByLaneId = new Map<string, number>()
  const inputSwimlanes = Array.isArray(commit.inputSwimlanes) ? commit.inputSwimlanes : []
  const outputSwimlanes = Array.isArray(commit.outputSwimlanes) ? commit.outputSwimlanes : []
  const safeCircleLaneIndex = Math.max(0, commit.circleLaneIndex || 0)
  const currentX = laneCenter(safeCircleLaneIndex)
  const currentLane = inputSwimlanes[safeCircleLaneIndex]
  const currentColor = currentLane ? resolveLaneColor(currentLane) : 'var(--text-primary)'

  inputSwimlanes.forEach((lane, index) => {
    inputIndexByLaneId.set(lane.id, index)
  })

  outputSwimlanes.forEach((lane, index) => {
    outputIndexByLaneId.set(lane.id, index)
  })

  for (const [inputIndex, lane] of inputSwimlanes.entries()) {
    const inputX = laneCenter(inputIndex)
    const outputIndex = outputIndexByLaneId.get(lane.id)
    const color = resolveLaneColor(lane)

    if (typeof outputIndex === 'number') {
      const outputX = laneCenter(outputIndex)
      if (inputIndex === outputIndex) {
        elements.push({
          type: 'line',
          x1: inputX,
          y1: 0,
          x2: inputX,
          y2: ROW_HEIGHT,
          color
        })
      } else {
        elements.push({
          type: 'path',
          d: buildLaneTransitionPath(inputX, outputX, 0, ROW_HEIGHT),
          color
        })
      }
      continue
    }

    elements.push({
      type: 'line',
      x1: inputX,
      y1: 0,
      x2: inputX,
      y2: centerY,
      color
    })
  }

  for (const [outputIndex, lane] of outputSwimlanes.entries()) {
    const outputX = laneCenter(outputIndex)
    const inputIndex = inputIndexByLaneId.get(lane.id)
    const color = resolveLaneColor(lane)

    if (typeof inputIndex !== 'number') {
      elements.push({
        type: 'path',
        d: buildCurvePath(currentX, outputX),
        color
      })
    }
  }

  if (commit.kind === 'head') {
    elements.push({
      type: 'circle',
      cx: currentX,
      cy: centerY,
      r: NODE_RADIUS + 1.25,
      fill: 'var(--bg-primary)',
      stroke: currentColor,
      strokeWidth: 2
    })
    elements.push({
      type: 'circle',
      cx: currentX,
      cy: centerY,
      r: NODE_INNER_RADIUS + 1,
      fill: currentColor,
      stroke: currentColor,
      strokeWidth: 1
    })
    return elements
  }

  if (commit.kind === 'merge') {
    elements.push({
      type: 'circle',
      cx: currentX,
      cy: centerY,
      r: NODE_RADIUS + 1,
      fill: 'var(--bg-primary)',
      stroke: currentColor,
      strokeWidth: 2
    })
    elements.push({
      type: 'circle',
      cx: currentX,
      cy: centerY,
      r: NODE_RADIUS - 1.25,
      fill: 'var(--bg-primary)',
      stroke: currentColor,
      strokeWidth: 1.5
    })
    return elements
  }

  if (commit.kind === 'incoming-changes' || commit.kind === 'outgoing-changes') {
    elements.push({
      type: 'circle',
      cx: currentX,
      cy: centerY,
      r: NODE_RADIUS + 2,
      fill: 'transparent',
      stroke: currentColor,
      strokeWidth: 1.5,
      dashArray: '3 2'
    })
    elements.push({
      type: 'circle',
      cx: currentX,
      cy: centerY,
      r: NODE_RADIUS,
      fill: 'var(--bg-primary)',
      stroke: currentColor,
      strokeWidth: 2
    })
    elements.push({
      type: 'circle',
      cx: currentX,
      cy: centerY,
      r: NODE_INNER_RADIUS,
      fill: currentColor,
      stroke: currentColor,
      strokeWidth: 1
    })
    return elements
  }

  elements.push({
    type: 'circle',
    cx: currentX,
    cy: centerY,
    r: NODE_RADIUS,
    fill: 'var(--bg-primary)',
    stroke: currentColor,
    strokeWidth: 2
  })

  return elements
}

function getCommitSubject(commit: ProjectGitCommitItem): string {
  if (commit.kind === 'outgoing-changes') {
    return t('inspector.history.outgoingPill')
  }
  if (commit.kind === 'incoming-changes') {
    return t('inspector.history.incomingPill')
  }
  return commit.message
}

function getCommitSource(commit: ProjectGitCommitItem): string {
  if (commit.kind === 'outgoing-changes') {
    return t('inspector.history.currentBranch')
  }
  if (commit.kind === 'incoming-changes') {
    return t('inspector.history.upstreamBranch')
  }
  return commit.author || '--'
}

function getCommitWhen(commit: ProjectGitCommitItem): string {
  if (commit.kind === 'incoming-changes' || commit.kind === 'outgoing-changes') {
    return t('inspector.history.syncStatus')
  }
  return commit.relativeDate || '--'
}

function getHoverTitle(commit: ProjectGitCommitItem): string {
  if (commit.kind === 'outgoing-changes') {
    return t('inspector.history.outgoingSummary', {
      count: commit.syntheticCount ?? 0,
      branch: commit.syntheticRef || commit.refs[0] || '--'
    })
  }
  if (commit.kind === 'incoming-changes') {
    return t('inspector.history.incomingSummary', {
      count: commit.syntheticCount ?? 0,
      branch: commit.syntheticRef || commit.refs[0] || '--'
    })
  }
  return commit.message
}

function updateHoverCardPosition(event: PointerEvent): void {
  hoverCardStyle.value = {
    position: 'fixed',
    left: `${Math.min(event.clientX + 16, window.innerWidth - 320)}px`,
    top: `${Math.min(event.clientY + 16, window.innerHeight - 180)}px`
  }
}

function clearHoverLeaveTimer(): void {
  if (hoverLeaveTimer != null) {
    window.clearTimeout(hoverLeaveTimer)
    hoverLeaveTimer = null
  }
}

function handleRowPointerEnter(event: PointerEvent, commit: ProjectGitCommitItem): void {
  clearHoverLeaveTimer()
  hoverCardHovered.value = false
  hoveredCommit.value = commit
  updateHoverCardPosition(event)
}

function handleRowPointerMove(event: PointerEvent): void {
  if (!hoveredCommit.value) return
  updateHoverCardPosition(event)
}

function handleRowPointerLeave(): void {
  clearHoverLeaveTimer()
  hoverLeaveTimer = window.setTimeout(() => {
    if (!hoverCardHovered.value) {
      hoveredCommit.value = null
    }
    hoverLeaveTimer = null
  }, 80)
}

function handleHoverCardLeave(): void {
  hoverCardHovered.value = false
  hoveredCommit.value = null
}

function handleSelect(commit: ProjectGitCommitItem): void {
  emit('select', commit)
}

function handleScroll(event: Event): void {
  if (!props.hasMore || props.loading) return

  const target = event.target as HTMLElement
  const nearBottom = target.scrollHeight - target.scrollTop - target.clientHeight < 100
  if (nearBottom) {
    emit('loadMore')
  }
}

function getRefClass(ref: string): string {
  if (ref.startsWith('HEAD')) return 'ref-head'
  if (ref.includes('->')) return 'ref-branch'
  if (ref.startsWith('tag:')) return 'ref-tag'
  if (ref.includes('/')) return 'ref-remote'
  return 'ref-branch'
}

function formatRef(ref: string): string {
  if (ref.startsWith('HEAD -> ')) return ref.replace('HEAD -> ', '')
  if (ref.startsWith('tag: ')) return ref.replace('tag: ', '')
  return ref
}
</script>

<style scoped lang="scss">
@use '../assets/styles/tree-styles.scss' as tree;

.git-history-graph {
  height: 100%;
  min-height: 0;
  overflow: auto;
  font-size: 12px;
  padding: 0 0 8px;
}

.tree-message {
  @include tree.tree-message;
}

.commit-row {
  position: relative;
  height: 24px;
  margin: 0;
  padding: 0;
  overflow: hidden;
  cursor: pointer;
  transition: background 0.12s ease;

  &:hover {
    background: color-mix(in srgb, var(--bg-hover) 74%, transparent);
  }

  &.selected {
    background: color-mix(in srgb, var(--accent-primary) 8%, transparent);
  }

  &.kind-incoming-changes,
  &.kind-outgoing-changes {
    background: color-mix(in srgb, var(--bg-secondary) 88%, transparent);
  }
}

.commit-graph-stage {
  position: relative;
  width: 100%;
  height: 24px;
}

.graph-svg {
  display: block;
  overflow: visible;
}

.commit-chip {
  position: absolute;
  left: var(--graph-content-left);
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
  max-width: calc(100% - var(--graph-content-left) - 8px);
  min-width: 0;
  padding: 2px 8px 2px 6px;
  background: transparent;
  border: none;
}

.commit-info {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  overflow: hidden;
}

.commit-subject {
  flex: 1;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 12px;
  font-weight: 550;
  color: var(--text-primary);
}

.commit-refs {
  display: flex;
  gap: 4px;
  flex-shrink: 1;
  align-items: center;
  min-width: 0;
  max-width: 38%;
  overflow: hidden;
  white-space: nowrap;
}

.ref-badge {
  display: inline-flex;
  align-items: center;
  padding: 1px 6px;
  border-radius: 999px;
  font-size: 10px;
  font-family: var(--font-mono);
  font-weight: 600;
  flex-shrink: 0;

  &.ref-head {
    background: var(--accent-primary);
    color: #fff;
  }

  &.ref-branch {
    background: color-mix(in srgb, var(--accent-primary) 16%, transparent);
    color: var(--accent-primary);
  }

  &.ref-tag {
    background: color-mix(in srgb, var(--warning-color) 16%, transparent);
    color: var(--warning-color);
  }

  &.ref-remote {
    background: color-mix(in srgb, var(--accent-secondary) 16%, transparent);
    color: var(--accent-secondary);
  }

  &.ref-more {
    background: color-mix(in srgb, var(--text-muted) 16%, transparent);
    color: var(--text-muted);
  }
}

.history-hover-card {
  z-index: 1200;
  width: min(304px, calc(100vw - 24px));
  padding: 10px 12px;
  border: 1px solid var(--border-color);
  background: color-mix(in srgb, var(--bg-secondary) 94%, var(--bg-primary) 6%);
  box-shadow: var(--shadow-lg);
  pointer-events: auto;
}

.hover-card-title {
  color: var(--text-primary);
  font-size: 12px;
  font-weight: 600;
  line-height: 1.45;
}

.hover-card-meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-top: 6px;
  color: var(--text-secondary);
  font-size: 11px;
}

.hover-card-line {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin-top: 8px;
  color: var(--text-secondary);
  font-size: 11px;

  code {
    font-family: var(--font-mono);
    color: var(--text-primary);
  }

  &.refs {
    align-items: center;
  }
}

.hover-card-label {
  flex-shrink: 0;
  color: var(--text-muted);
}

.hover-card-refs {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.load-more {
  padding: 10px 12px 4px;
}

.load-more-btn {
  width: 100%;
  padding: 8px;
  border: 1px solid var(--border-color);
  background: var(--bg-secondary);
  color: var(--text-secondary);
  font-size: 12px;
  cursor: pointer;

  &:hover:not(:disabled) {
    color: var(--text-primary);
    background: var(--bg-hover);
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
}
</style>
