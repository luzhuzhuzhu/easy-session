import { onBeforeUnmount, watch } from 'vue'

type OverlayLayer = {
  id: symbol
  closeOnEscape: () => boolean
  onEscape: () => void
}

type UseOverlayStackOptions = {
  isOpen: () => boolean
  onEscape: () => void
  closeOnEscape?: () => boolean
}

const layers: OverlayLayer[] = []
let listening = false

function handleDocumentKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Escape') return
  const topLayer = layers[layers.length - 1]
  if (!topLayer || !topLayer.closeOnEscape()) return
  event.preventDefault()
  event.stopPropagation()
  topLayer.onEscape()
}

function ensureListener(): void {
  if (listening || typeof document === 'undefined') return
  document.addEventListener('keydown', handleDocumentKeydown)
  listening = true
}

function removeListenerIfIdle(): void {
  if (!listening || layers.length > 0 || typeof document === 'undefined') return
  document.removeEventListener('keydown', handleDocumentKeydown)
  listening = false
}

function registerLayer(layer: OverlayLayer): void {
  if (layers.some((item) => item.id === layer.id)) return
  layers.push(layer)
  ensureListener()
}

function unregisterLayer(id: symbol): void {
  const index = layers.findIndex((item) => item.id === id)
  if (index !== -1) {
    layers.splice(index, 1)
  }
  removeListenerIfIdle()
}

export function useOverlayStack(options: UseOverlayStackOptions) {
  const id = Symbol('overlay-layer')
  const layer: OverlayLayer = {
    id,
    closeOnEscape: () => options.closeOnEscape?.() ?? true,
    onEscape: () => options.onEscape()
  }

  watch(
    options.isOpen,
    (open) => {
      if (open) {
        registerLayer(layer)
      } else {
        unregisterLayer(id)
      }
    },
    { immediate: true }
  )

  onBeforeUnmount(() => {
    unregisterLayer(id)
  })
}
