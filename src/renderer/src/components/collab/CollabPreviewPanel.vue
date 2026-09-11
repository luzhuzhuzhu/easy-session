<template>
  <div class="panel-content">
    <div class="panel-toolbar">
      <span class="count">{{ activeTerminalName || '-' }}</span>
    </div>
    <div class="preview-region">
      <slot />
      <p v-if="!hasTargetSession" class="empty compact">{{ $t('collab.noOutputPreview') }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
// STAB-11：协作页「会话预览」面板（外壳；终端由父视图经 slot 注入）。
defineProps<{
  activeTerminalName: string
  hasTargetSession: boolean
}>()
</script>

<style scoped lang="scss">
@use './panel-mixins' as panel;

@include panel.shell;

.preview-region {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  padding: 6px;
  overflow: hidden;
}

.preview-region :slotted(.collab-terminal) {
  flex: 1 1 auto;
  min-height: 0;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: var(--bg-primary);
}
</style>
