<template>
  <Teleport to="body">
    <DialogShell
      v-if="shortcutHelp.visible.value"
      ref="dialogShellRef"
      overlay-class="shortcut-help-overlay"
      panel-class="shortcut-help-dialog"
      :aria-label="$t('shortcuts.title')"
      @backdrop="shortcutHelp.close"
    >
      <header class="shortcut-help-header">
        <div>
          <h2>{{ $t('shortcuts.title') }}</h2>
          <p>{{ $t('shortcuts.subtitle') }}</p>
        </div>
        <IconButton
          :label="$t('shortcuts.close')"
          :title="$t('shortcuts.close')"
          @click="shortcutHelp.close"
        >
          <UiIcon name="x" />
        </IconButton>
      </header>

      <div class="shortcut-help-groups">
        <section
          v-for="group in groups"
          :key="group.key"
          class="shortcut-help-group"
        >
          <h3>{{ group.title }}</h3>
          <div class="shortcut-help-list">
            <div
              v-for="item in group.items"
              :key="item.keys.join('+') + item.label"
              class="shortcut-help-row"
            >
              <div class="shortcut-help-keys">
                <kbd v-for="key in item.keys" :key="key">{{ key }}</kbd>
              </div>
              <span>{{ item.label }}</span>
            </div>
          </div>
        </section>
      </div>
    </DialogShell>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, watch, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useShortcutHelp } from '@/composables/useShortcutHelp'
import { useOverlayStack } from '@/composables/useOverlayStack'
import DialogShell from '@/components/ui/DialogShell.vue'
import IconButton from '@/components/ui/IconButton.vue'
import UiIcon from '@/components/ui/UiIcon.vue'

type ShortcutGroup = {
  key: string
  title: string
  items: Array<{
    keys: string[]
    label: string
  }>
}

const { t } = useI18n()
const shortcutHelp = useShortcutHelp()
type DialogShellExpose = { focus: () => void }
const dialogShellRef = ref<DialogShellExpose | null>(null)

const groups = computed<ShortcutGroup[]>(() => [
  {
    key: 'navigation',
    title: t('shortcuts.groups.navigation'),
    items: [
      { keys: ['Ctrl', '1'], label: t('shortcuts.items.dashboard') },
      { keys: ['Ctrl', '2'], label: t('shortcuts.items.sessions') },
      { keys: ['Ctrl', '3'], label: t('shortcuts.items.projects') },
      { keys: ['Ctrl', '4'], label: t('shortcuts.items.skills') },
      { keys: ['Ctrl', '5'], label: t('shortcuts.items.settings') },
      { keys: ['Ctrl', ','], label: t('shortcuts.items.settings') }
    ]
  },
  {
    key: 'workspace',
    title: t('shortcuts.groups.workspace'),
    items: [
      { keys: ['Ctrl', 'N'], label: t('shortcuts.items.newSession') },
      { keys: ['Ctrl', 'W'], label: t('shortcuts.items.closeTab') },
      { keys: ['Ctrl', 'Z'], label: t('shortcuts.items.undoPane') }
    ]
  },
  {
    key: 'help',
    title: t('shortcuts.groups.help'),
    items: [
      { keys: ['Ctrl', '/'], label: t('shortcuts.items.help') },
      { keys: ['F1'], label: t('shortcuts.items.help') }
    ]
  }
])

watch(
  () => shortcutHelp.visible.value,
  async (visible) => {
    if (!visible) return
    await nextTick()
    dialogShellRef.value?.focus()
  }
)

useOverlayStack({
  isOpen: () => shortcutHelp.visible.value,
  onEscape: shortcutHelp.close
})
</script>

<style scoped lang="scss">
.shortcut-help-overlay {
  z-index: 1900;
}

.shortcut-help-dialog {
  width: min(92vw, 720px);
  max-height: min(82vh, 680px);
  display: flex;
  flex-direction: column;
  border: 1px solid color-mix(in srgb, var(--border-color) 86%, var(--accent-primary) 14%);
  border-radius: 8px;
  background: var(--bg-primary);
  box-shadow: var(--shadow-lg);
  outline: none;
  overflow: hidden;
  padding: 0;
}

.shortcut-help-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
  padding: 18px 20px 14px;
  border-bottom: 1px solid var(--border-color);
  background: var(--bg-secondary);

  h2 {
    margin: 0;
    color: var(--text-primary);
    font-size: 17px;
    font-weight: 700;
  }

  p {
    margin: 6px 0 0;
    color: var(--text-muted);
    font-size: 12px;
    line-height: 1.5;
  }
}

.shortcut-help-groups {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 0;
  overflow: auto;
}

.shortcut-help-group {
  min-width: 0;
  padding: 16px 18px 18px;
  border-right: 1px solid color-mix(in srgb, var(--border-color) 74%, transparent);
  border-bottom: 1px solid color-mix(in srgb, var(--border-color) 74%, transparent);

  h3 {
    margin: 0 0 10px;
    color: var(--text-primary);
    font-size: 12px;
    font-weight: 700;
  }
}

.shortcut-help-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.shortcut-help-row {
  display: grid;
  grid-template-columns: minmax(92px, auto) minmax(0, 1fr);
  align-items: center;
  gap: 12px;
  min-width: 0;
  color: var(--text-secondary);
  font-size: 12px;
}

.shortcut-help-keys {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
}

kbd {
  min-width: 22px;
  height: 22px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0 6px;
  border: 1px solid color-mix(in srgb, var(--border-color) 80%, var(--text-muted) 20%);
  border-radius: 4px;
  background: var(--bg-secondary);
  color: var(--text-primary);
  font-size: 11px;
  font-family: var(--font-mono);
  box-shadow: inset 0 -1px 0 color-mix(in srgb, var(--border-color) 80%, transparent);
}
</style>
