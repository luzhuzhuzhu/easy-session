<template>
  <div class="panel-content">
    <div class="panel-toolbar">
      <span class="count">{{ activeAgentName || $t('collab.chatNoMember') }}</span>
    </div>
    <div class="chat-region">
      <div ref="chatScrollEl" class="chat-scroll">
        <p v-if="!activeAgentId" class="empty compact">{{ $t('collab.chatPickMember') }}</p>
        <template v-else>
          <article
            v-for="msg in conversation"
            :key="msg.id"
            class="chat-msg"
            :class="{ mine: msg.from === 'user' }"
          >
            <div class="chat-msg-head">
              <strong>{{ msg.fromName }}</strong>
              <time>{{ clock(msg.createdAt) }}</time>
            </div>
            <p>{{ msg.body }}</p>
          </article>
          <p v-if="!conversation.length" class="empty compact">{{ $t('collab.noMessages') }}</p>
        </template>
      </div>
      <div v-if="activeAgentId" class="chat-composer">
        <div v-if="commandMenuOpen" class="cmd-menu" role="listbox">
          <button
            v-for="(cmd, i) in filteredCommands"
            :key="cmd.name"
            type="button"
            class="cmd-item"
            :class="{ active: i === activeMenuIndex }"
            @mousedown.prevent="$emit('complete-command', cmd)"
          >
            <b>/{{ cmd.name }}</b>
            <span v-if="cmd.argHint" class="cmd-arg">{{ cmd.argHint }}</span>
            <span class="cmd-desc">{{ $t(cmd.descKey) }}</span>
          </button>
        </div>
        <textarea
          ref="chatInputEl"
          :value="chatInput"
          class="chat-input"
          rows="1"
          :placeholder="$t('collab.chatPlaceholder')"
          @input="$emit('update:chatInput', ($event.target as HTMLTextAreaElement).value)"
          @keydown="$emit('chat-keydown', $event)"
        ></textarea>
        <button
          class="primary-button small"
          type="button"
          :disabled="chatSending || !chatInput.trim()"
          @click="$emit('submit-chat')"
        >
          {{ $t('collab.send') }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
// STAB-11：协作页「聊天」面板（含斜杠命令菜单的呈现层；状态与逻辑留在父视图）。
import { ref, watch, type Ref } from 'vue'
import type { SlashCommand } from './types'

export interface ChatMessageView {
  id: string
  from: string
  fromName: string
  body: string
  createdAt: number
}

const props = defineProps<{
  activeAgentId: string
  activeAgentName: string
  conversation: ChatMessageView[]
  chatInput: string
  chatSending: boolean
  commandMenuOpen: boolean
  filteredCommands: SlashCommand[]
  activeMenuIndex: number
  clock: (at: number) => string
}>()

defineEmits<{
  'update:chatInput': [value: string]
  'complete-command': [cmd: SlashCommand]
  'chat-keydown': [event: KeyboardEvent]
  'submit-chat': []
}>()

// 聊天滚动锚定：消息数量或聚焦成员变化时滚到底部（DOM 引用属于本组件）。
const chatScrollEl = ref<HTMLElement | null>(null)
const chatInputEl = ref<HTMLTextAreaElement | null>(null)

watch(
  () => [props.activeAgentId, props.conversation.length],
  () => {
    void Promise.resolve().then(() => {
      const el = chatScrollEl.value
      if (el) el.scrollTop = el.scrollHeight
    })
  }
)

defineExpose({
  chatScrollEl: chatScrollEl as Ref<HTMLElement | null>,
  chatInputEl: chatInputEl as Ref<HTMLTextAreaElement | null>,
  focusInput: () => {
    const el = chatInputEl.value
    if (el) {
      el.focus()
      el.selectionStart = el.selectionEnd = el.value.length
    }
  }
})
</script>

<style scoped lang="scss">
@use './panel-mixins' as panel;

@include panel.shell;
@include panel.form-controls;
@include panel.action-buttons;

.chat-region {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  padding: 6px;
  overflow: hidden;
}

.chat-scroll {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 6px;
  min-height: 0;
  margin-bottom: 6px;
  padding-right: 2px;
  overflow-y: auto;
}

.chat-msg {
  align-self: flex-start;
  max-width: 86%;
  padding: 6px 9px;
  border: 1px solid var(--border-color);
  border-radius: 9px;
  background: var(--bg-primary);
}

.chat-msg.mine {
  align-self: flex-end;
  border-color: color-mix(in srgb, var(--accent-primary) 35%, var(--border-color));
  background: color-mix(in srgb, var(--accent-primary) 12%, var(--bg-primary));
}

.chat-msg-head {
  display: flex;
  align-items: baseline;
  gap: 6px;
  color: var(--text-muted);
  font-size: var(--font-size-xs);
}

.chat-msg strong {
  color: var(--text-secondary);
}

.chat-msg time {
  margin-left: auto;
}

.chat-msg p {
  margin: 3px 0 0;
  color: var(--text-primary);
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 12px;
  line-height: 1.4;
}

.chat-composer {
  position: relative;
  display: grid;
  flex-shrink: 0;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: end;
  gap: 6px;
}

.chat-input {
  height: 48px;
  min-height: 48px;
  max-height: 110px;
}

.cmd-menu {
  position: absolute;
  right: 0;
  bottom: calc(100% + 6px);
  left: 0;
  z-index: 30;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 5px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-card, var(--bg-secondary));
  box-shadow: var(--shadow-lg);
}

.cmd-item {
  display: flex;
  align-items: baseline;
  gap: 7px;
  padding: 5px 7px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--text-secondary);
  text-align: left;
  cursor: pointer;
}

.cmd-item.active,
.cmd-item:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.cmd-item b {
  color: var(--accent-primary);
  font-family: var(--font-mono, monospace);
  font-size: 12px;
}

.cmd-arg {
  color: var(--text-muted);
  font-family: var(--font-mono, monospace);
  font-size: var(--font-size-xs);
}

.cmd-desc {
  margin-left: auto;
  color: var(--text-muted);
  font-size: var(--font-size-xs);
}
</style>
