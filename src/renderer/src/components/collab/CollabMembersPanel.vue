<template>
  <div class="panel-content">
    <div class="panel-toolbar">
      <button
        v-if="agents.length"
        type="button"
        class="rail-all-button"
        @click="$emit('toggle-all')"
      >
        {{ allSelected ? $t('collab.clearAll') : $t('collab.selectAllOnline') }}
      </button>
      <span v-else class="count">{{ $t('collab.noAgents') }}</span>
    </div>
    <div class="agent-list">
      <article
        v-for="agent in agents"
        :key="agent.sessionId"
        class="agent-row"
        :class="{ selected: activeAgentId === agent.sessionId, targeted: isTarget(agent.sessionId) }"
        @click="$emit('focus-agent', agent.sessionId)"
      >
        <label class="agent-check" :title="$t('collab.includeInBroadcast')" @click.stop>
          <input
            type="checkbox"
            :checked="isTarget(agent.sessionId)"
            @change="$emit('toggle-target', agent.sessionId)"
          />
        </label>
        <div class="agent-main">
          <span class="agent-avatar" :class="`type-${agent.type}`">
            <span v-if="agentIcon(agent)" class="session-emoji">{{ agentIcon(agent) }}</span>
            <span v-else class="type-letter">{{ cliTypeBadgeLetter(agent.type) }}</span>
          </span>
          <div class="agent-name">
            <strong>{{ agent.name }}</strong>
            <small>
              <span>{{ agent.type }}</span>
              <span v-if="sessionOf(agent.sessionId)"> · {{ statusLabelForSession(agent.sessionId) }}</span>
            </small>
          </div>
          <span class="mode-chip" :class="{ muted: !agent.injectable }">{{ shortModeLabel(agent.collabMode) }}</span>
        </div>
        <div class="agent-badges">
          <span class="badge">{{ agent.unread || 0 }}</span>
          <span class="badge">{{ agent.activeTaskCount || 0 }}</span>
        </div>
        <div v-if="agent.type === 'terminal'" class="terminal-mode" :title="$t('collab.terminalRisk')" @click.stop>
          <select :value="agent.collabMode" @change="$emit('change-mode', agent.sessionId, $event)">
            <option value="terminal-readonly">{{ modeLabel('terminal-readonly') }}</option>
            <option value="terminal-nudge">{{ modeLabel('terminal-nudge') }}</option>
            <option value="terminal-inject">{{ modeLabel('terminal-inject') }}</option>
          </select>
        </div>
      </article>
    </div>
  </div>
</template>

<script setup lang="ts">
// STAB-11：协作页「成员栏」面板。展示/交互逻辑留在父视图，这里只负责呈现与转发。
import type { AgentIdentity, AgentCollabMode } from '@/api/agent-bus'
import type { UnifiedSession } from '@/models/unified-resource'
import { cliTypeBadgeLetter } from '@shared/cli-types'

const props = defineProps<{
  agents: AgentIdentity[]
  activeAgentId: string
  selectedTargets: string[]
  allSelected: boolean
  sessionOf: (sessionId: string) => UnifiedSession | undefined
  agentIcon: (agent: { sessionId: string }) => string | null
  statusLabelForSession: (sessionId: string) => string
  shortModeLabel: (mode: AgentCollabMode) => string
  modeLabel: (mode: AgentCollabMode) => string
}>()

defineEmits<{
  'toggle-all': []
  'focus-agent': [sessionId: string]
  'toggle-target': [sessionId: string]
  'change-mode': [sessionId: string, event: Event]
}>()

function isTarget(sessionId: string): boolean {
  return props.selectedTargets.includes(sessionId)
}
</script>

<style scoped lang="scss">
@use './panel-mixins' as panel;

@include panel.shell;
@include panel.form-controls;

.rail-all-button {
  height: 22px;
  margin-left: auto;
  padding: 0 8px;
  border: 1px solid var(--border-color);
  border-radius: 999px;
  background: var(--bg-secondary);
  color: var(--text-secondary);
  font-size: var(--font-size-xs);
  font-weight: 650;
  cursor: pointer;
}

.rail-all-button:hover {
  border-color: var(--accent-primary);
  color: var(--text-primary);
}

.agent-list {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 5px;
  min-height: 0;
  padding: 8px;
  overflow-y: auto;
}

.agent-row {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 6px;
  padding: 6px;
  border: 1px solid transparent;
  border-radius: 6px;
  background: var(--bg-primary);
  cursor: pointer;
  transition: border-color 120ms ease, background 120ms ease;
}

.agent-row:hover {
  border-color: color-mix(in srgb, var(--accent-primary) 48%, var(--border-color));
}

.agent-row.targeted {
  background: color-mix(in srgb, var(--accent-primary) 6%, var(--bg-primary));
}

.agent-row.selected {
  border-color: var(--accent-primary);
  background: color-mix(in srgb, var(--accent-primary) 10%, var(--bg-primary));
}

.agent-check {
  display: grid;
  place-items: center;
}

.agent-check input {
  width: 14px;
  height: 14px;
  accent-color: var(--accent-primary);
  cursor: pointer;
}

.agent-main {
  display: grid;
  grid-template-columns: 26px minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.agent-name {
  min-width: 0;
}

.agent-name strong,
.agent-name small {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.agent-name strong {
  color: var(--text-primary);
  font-size: 12px;
  line-height: 1.2;
}

.agent-name small {
  display: flex;
  align-items: center;
  gap: 3px;
  color: var(--text-muted);
  font-size: var(--font-size-xs);
}

.agent-avatar {
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  overflow: hidden;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: color-mix(in srgb, var(--accent-primary) 14%, var(--bg-tertiary));
  color: var(--text-primary);
  font-size: 14px;
  font-weight: 800;
  line-height: 1;
}

.agent-avatar.type-claude {
  background: color-mix(in srgb, var(--accent-primary) 18%, var(--bg-tertiary));
}

.agent-avatar.type-codex {
  background: color-mix(in srgb, var(--badge-codex) 18%, var(--bg-tertiary));
}

.agent-avatar.type-opencode {
  background: color-mix(in srgb, var(--status-info) 18%, var(--bg-tertiary));
}

.agent-avatar.type-terminal {
  background: color-mix(in srgb, var(--status-success) 18%, var(--bg-tertiary));
}

.session-emoji {
  font-size: 16px;
}

.type-letter {
  font-size: 11px;
  letter-spacing: 0;
}

.mode-chip,
.badge {
  padding: 3px 6px;
  border-radius: 999px;
  background: var(--bg-tertiary);
  color: var(--text-secondary);
  font-size: var(--font-size-xs);
  line-height: 1;
}

.mode-chip.muted {
  color: var(--text-muted);
}

.agent-badges {
  display: flex;
  align-items: center;
  gap: 4px;
}

.terminal-mode {
  grid-column: 1 / -1;
}

.terminal-mode select {
  height: 28px;
  font-size: 11px;
}
</style>
