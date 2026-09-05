import { defineStore } from 'pinia'
import { ref } from 'vue'

export type ToastType = 'success' | 'error' | 'warning' | 'info'

export interface ToastItem {
  id: number
  type: ToastType
  title?: string
  message: string
  duration: number
  /** 可选操作按钮文案（如「查看崩溃日志」） */
  actionLabel?: string
  /** 点击操作按钮时触发（按钮点击后 toast 自动关闭） */
  onAction?: () => void
}

let nextId = 0

export const useToastStore = defineStore('toast', () => {
  const toasts = ref<ToastItem[]>([])

  function add(
    type: ToastType,
    message: string,
    title?: string,
    options?: { actionLabel?: string; onAction?: () => void; duration?: number }
  ) {
    const duration = options?.duration ?? (type === 'error' ? 10000 : 5000)
    const item: ToastItem = {
      id: ++nextId,
      type,
      message,
      title,
      duration,
      actionLabel: options?.actionLabel,
      onAction: options?.onAction
    }
    toasts.value.push(item)
    return item.id
  }

  function remove(id: number) {
    toasts.value = toasts.value.filter(t => t.id !== id)
  }

  return { toasts, add, remove }
})

export function useToast() {
  const store = useToastStore()
  return {
    success: (msg: string, title?: string) => store.add('success', msg, title),
    error: (msg: string, title?: string) => store.add('error', msg, title),
    warning: (msg: string, title?: string) => store.add('warning', msg, title),
    info: (msg: string, title?: string) => store.add('info', msg, title),
    withAction: (
      type: ToastType,
      msg: string,
      title: string | undefined,
      actionLabel: string,
      onAction: () => void
    ) => store.add(type, msg, title, { actionLabel, onAction, duration: 12000 })
  }
}
