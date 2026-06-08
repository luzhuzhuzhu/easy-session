import { defineStore } from 'pinia'
import { ref } from 'vue'

export type ConfirmDialogTone = 'default' | 'danger'

export interface ConfirmDialogOptions {
  title: string
  message?: string
  details?: string
  confirmText?: string
  cancelText?: string
  tone?: ConfirmDialogTone
}

export interface ConfirmDialogRequest extends Required<Omit<ConfirmDialogOptions, 'message' | 'details'>> {
  id: number
  message: string
  details: string
}

let nextId = 0

export const useConfirmDialogStore = defineStore('confirmDialog', () => {
  const current = ref<ConfirmDialogRequest | null>(null)
  let resolveCurrent: ((confirmed: boolean) => void) | null = null

  function close(confirmed: boolean): void {
    if (!resolveCurrent) return
    const resolve = resolveCurrent
    resolveCurrent = null
    current.value = null
    resolve(confirmed)
  }

  function confirm(options: ConfirmDialogOptions): Promise<boolean> {
    if (resolveCurrent) {
      close(false)
    }

    current.value = {
      id: ++nextId,
      title: options.title,
      message: options.message ?? '',
      details: options.details ?? '',
      confirmText: options.confirmText ?? '',
      cancelText: options.cancelText ?? '',
      tone: options.tone ?? 'default'
    }

    return new Promise((resolve) => {
      resolveCurrent = resolve
    })
  }

  return {
    current,
    confirm,
    cancel: () => close(false),
    accept: () => close(true)
  }
})

export function useConfirmDialog() {
  const store = useConfirmDialogStore()

  return {
    confirm: store.confirm
  }
}
