import type { App } from 'vue'
import { useToastStore } from './useToast'

function formatError(err: unknown): string {
  if (err instanceof Error) return err.message
  return String(err)
}

export function setupGlobalErrorHandler(app: App) {
  const toastStore = useToastStore()

  // Vue component error handler
  app.config.errorHandler = (err, _instance, info) => {
    toastStore.add('error', formatError(err))
    if (import.meta.env.DEV) {
      console.error('[Vue Error]', info, err)
    }
  }

  // Runtime errors
  window.onerror = (_msg, _source, _line, _col, err) => {
    toastStore.add('error', formatError(err ?? _msg))
    if (import.meta.env.DEV) {
      console.error('[Runtime Error]', err)
    }
  }

  // Unhandled promise rejections
  window.onunhandledrejection = (event) => {
    toastStore.add('error', formatError(event.reason))
    if (import.meta.env.DEV) {
      console.error('[Unhandled Rejection]', event.reason)
    }
  }
}
