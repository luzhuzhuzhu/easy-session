import { ref, type Ref } from 'vue'

// 通用 HTML5 拖拽重排：调用方提供 getItems(当前可渲染/可拖拽项，通常是可见子集)、
// keyOf 与 onReorder。drop 时计算「被拖项移动到目标项位置」后的新顺序键数组并回调，
// 由调用方决定如何写回（例如把可见顺序合并回包含隐藏项的完整顺序）。
export interface DragReorderOptions<T> {
  getItems: () => T[]
  keyOf: (item: T) => string
  onReorder: (orderedKeys: string[]) => void
}

export interface DragReorder {
  draggingKey: Ref<string | null>
  overKey: Ref<string | null>
  onDragStart: (key: string, event: DragEvent) => void
  onDragOver: (key: string, event: DragEvent) => void
  onDragLeave: (key: string) => void
  onDrop: (key: string, event: DragEvent) => void
  onDragEnd: () => void
}

export function useDragReorder<T>(options: DragReorderOptions<T>): DragReorder {
  const draggingKey = ref<string | null>(null)
  const overKey = ref<string | null>(null)

  function reset(): void {
    draggingKey.value = null
    overKey.value = null
  }

  function onDragStart(key: string, event: DragEvent): void {
    draggingKey.value = key
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move'
      // 某些浏览器必须 setData 才会真正开始拖拽。
      try {
        event.dataTransfer.setData('text/plain', key)
      } catch {
        // 忽略受保护场景下的写入失败。
      }
    }
  }

  function onDragOver(key: string, event: DragEvent): void {
    if (!draggingKey.value || draggingKey.value === key) return
    event.preventDefault()
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
    overKey.value = key
  }

  function onDragLeave(key: string): void {
    if (overKey.value === key) overKey.value = null
  }

  function onDrop(key: string, event: DragEvent): void {
    event.preventDefault()
    const dragged = draggingKey.value
    reset()
    if (!dragged || dragged === key) return
    const keys = options.getItems().map(options.keyOf)
    const from = keys.indexOf(dragged)
    const to = keys.indexOf(key)
    if (from < 0 || to < 0 || from === to) return
    const next = [...keys]
    next.splice(from, 1)
    next.splice(to, 0, dragged)
    options.onReorder(next)
  }

  function onDragEnd(): void {
    reset()
  }

  return { draggingKey, overKey, onDragStart, onDragOver, onDragLeave, onDrop, onDragEnd }
}
