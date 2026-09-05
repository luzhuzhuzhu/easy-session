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
