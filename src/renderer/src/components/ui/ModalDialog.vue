<template>
  <DialogShell
    ref="shellRef"
    :title-id="title ? titleId : undefined"
    :aria-label="ariaLabel"
    :panel-class="['modal-frame', panelClass]"
    :close-on-backdrop="closeOnBackdrop"
    @backdrop="$emit('close')"
  >
    <header class="modal-header">
      <slot name="header">
        <h3 :id="titleId" class="modal-title">{{ title }}</h3>
      </slot>
      <button
        class="modal-close"
        type="button"
        :aria-label="closeLabel"
        @click="$emit('close')"
      >&times;</button>
    </header>
    <div class="modal-body">
      <slot />
    </div>
    <footer v-if="$slots.footer" class="modal-footer">
      <slot name="footer" />
    </footer>
  </DialogShell>
</template>

<script lang="ts">
// 模块级序号，保证多个弹窗实例的 titleId 不重复
let modalDialogSeq = 0
</script>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import DialogShell from '@/components/ui/DialogShell.vue'

withDefaults(defineProps<{
  title?: string
  ariaLabel?: string
  closeLabel?: string
  panelClass?: string
  closeOnBackdrop?: boolean
}>(), {
  title: '',
  ariaLabel: undefined,
  closeLabel: 'Close',
  panelClass: '',
  closeOnBackdrop: true
})

defineEmits<{
  (e: 'close'): void
}>()

const titleId = `modal-title-${++modalDialogSeq}`
const shellRef = ref<InstanceType<typeof DialogShell> | null>(null)

onMounted(() => {
  shellRef.value?.focus()
})
</script>

<!-- 非 scoped：需要中和全局 .dialog 对插槽内容（label/h3）的级联 -->
<style lang="scss">
.dialog.modal-frame {
  display: flex;
  flex-direction: column;
  width: min(92vw, 760px);
  max-height: 88vh;
  padding: 0;
  overflow: hidden;

  // 全局 .dialog 是"简单卡片"范式（自带 padding 与 h3/label margin 级联）。
  // 三段式弹窗内的排版改由 header/body/footer 与各表单自身的 gap 控制。
  h3 {
    margin: 0;
  }

  label {
    margin: 0;
  }

  // 插槽内容是 flex 子项，默认 flex-shrink:1 会被压缩进容器而不产生溢出，
  // 导致内容"超出但滚不动"——必须禁止收缩让 modal-body 真正滚动
  .modal-body > * {
    flex-shrink: 0;
  }
}

@media (max-width: 560px) {
  .dialog.modal-frame {
    width: min(94vw, 520px);
  }
}
</style>

<style scoped lang="scss">
.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-sm);
  flex-shrink: 0;
  padding: 12px var(--spacing-lg);
  border-bottom: 1px solid var(--border-color);
}

.modal-title {
  min-width: 0;
  font-size: var(--font-size-md);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.modal-close {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: var(--radius-sm);
  background: none;
  color: var(--text-muted);
  cursor: pointer;
  font-size: 20px;
  transition: all var(--transition-fast);

  &:hover {
    color: var(--text-primary);
    background: var(--bg-hover);
  }
}

.modal-body {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  padding: var(--spacing-md) var(--spacing-lg);
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: var(--spacing-sm);
  flex-shrink: 0;
  padding: 12px var(--spacing-lg);
  border-top: 1px solid var(--border-color);
}
</style>
