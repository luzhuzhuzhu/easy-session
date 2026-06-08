import { readonly, ref } from 'vue'

const visible = ref(false)

export function useShortcutHelp() {
  function open(): void {
    visible.value = true
  }

  function close(): void {
    visible.value = false
  }

  function toggle(): void {
    visible.value = !visible.value
  }

  return {
    visible: readonly(visible),
    open,
    close,
    toggle
  }
}
