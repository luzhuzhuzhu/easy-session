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
  interface QueuedConfirm {
    request: ConfirmDialogRequest
    resolve: (confirmed: boolean) => void
  }

  const current = ref<ConfirmDialogRequest | null>(null)
  const queue: QueuedConfirm[] = []
  let resolveCurrent: ((confirmed: boolean) => void) | null = null

  function showNext(): void {
    const next = queue.shift()
    if (!next) {
      current.value = null
      resolveCurrent = null
      return
    }
    current.value = next.request
    resolveCurrent = next.resolve
  }

  function close(confirmed: boolean): void {
    if (!resolveCurrent) return
    const resolve = resolveCurrent
    resolveCurrent = null
    resolve(confirmed)
    // Advance to the next queued confirmation (if any) instead of silently
    // dropping it; a rapid second confirm() no longer cancels the first.
    showNext()
  }

  function confirm(options: ConfirmDialogOptions): Promise<boolean> {
    const request: ConfirmDialogRequest = {
      id: ++nextId,
      title: options.title,
      message: options.message ?? '',
      details: options.details ?? '',
      confirmText: options.confirmText ?? '',
      cancelText: options.cancelText ?? '',
      tone: options.tone ?? 'default'
    }

    return new Promise<boolean>((resolve) => {
      queue.push({ request, resolve })
      if (!current.value) {
        showNext()
      }
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
