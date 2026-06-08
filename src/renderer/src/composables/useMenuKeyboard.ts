import { nextTick, type Ref, watch } from 'vue'
import { useOverlayStack } from '@/composables/useOverlayStack'

type UseMenuKeyboardOptions = {
  menuRef: Ref<HTMLElement | null>
  isOpen: () => boolean
  onClose: () => void
  itemSelector?: string
}

const DEFAULT_ITEM_SELECTOR = 'button:not(:disabled), [role="menuitem"]:not([aria-disabled="true"])'

function isFocusableMenuItem(element: HTMLElement): boolean {
  if (element instanceof HTMLButtonElement && element.disabled) return false
  if (element.getAttribute('aria-disabled') === 'true') return false
  return element.getClientRects().length > 0
}

function focusElement(element: HTMLElement | null): void {
  element?.focus({ preventScroll: true })
}

export function useMenuKeyboard(options: UseMenuKeyboardOptions) {
  const selector = options.itemSelector ?? DEFAULT_ITEM_SELECTOR

  function getItems(): HTMLElement[] {
    const menu = options.menuRef.value
    if (!menu) return []
    return Array.from(menu.querySelectorAll<HTMLElement>(selector)).filter(isFocusableMenuItem)
  }

  function focusFirstItem(): void {
    const items = getItems()
    focusElement(items[0] ?? options.menuRef.value)
  }

  function focusByOffset(offset: 1 | -1): void {
    const items = getItems()
    if (items.length === 0) {
      focusElement(options.menuRef.value)
      return
    }

    const active = document.activeElement
    const currentIndex = items.findIndex((item) => item === active)
    const nextIndex =
      currentIndex === -1
        ? offset > 0 ? 0 : items.length - 1
        : (currentIndex + offset + items.length) % items.length
    focusElement(items[nextIndex])
  }

  function focusBoundaryItem(boundary: 'first' | 'last'): void {
    const items = getItems()
    focusElement(boundary === 'first' ? items[0] : items[items.length - 1])
  }

  function activateFocusedItem(): void {
    const active = document.activeElement
    if (!(active instanceof HTMLElement)) return
    if (!options.menuRef.value?.contains(active)) return
    if (!isFocusableMenuItem(active)) return
    active.click()
  }

  function handleMenuKeydown(event: KeyboardEvent): void {
    if (!options.isOpen()) return

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        focusByOffset(1)
        break
      case 'ArrowUp':
        event.preventDefault()
        focusByOffset(-1)
        break
      case 'Home':
        event.preventDefault()
        focusBoundaryItem('first')
        break
      case 'End':
        event.preventDefault()
        focusBoundaryItem('last')
        break
      case 'Enter':
      case ' ':
        event.preventDefault()
        activateFocusedItem()
        break
      case 'Escape':
        event.preventDefault()
        event.stopPropagation()
        options.onClose()
        break
    }
  }

  watch(
    options.isOpen,
    async (open) => {
      if (!open) return
      await nextTick()
      focusFirstItem()
    },
    { flush: 'post' }
  )

  useOverlayStack({
    isOpen: options.isOpen,
    onEscape: options.onClose
  })

  return {
    handleMenuKeydown,
    focusFirstItem
  }
}
