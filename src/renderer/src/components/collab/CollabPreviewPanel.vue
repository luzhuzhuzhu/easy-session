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
