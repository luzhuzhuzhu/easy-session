<template>
  <DynamicScroller
    v-if="shouldVirtualize && dynamic"
    ref="scrollerRef"
    class="virtual-tree"
    :items="itemsWithIndex"
    :min-item-size="itemHeight"
    key-field="key"
    v-slot="{ item, index, active }"
  >
    <DynamicScrollerItem
      :item="item"
      :active="active"
      :data-index="index"
    >
      <slot :node="(item as ItemWithIndex).node" :index="(item as ItemWithIndex)._index ?? 0" />
    </DynamicScrollerItem>
  </DynamicScroller>
  <RecycleScroller
    v-else-if="shouldVirtualize"
    ref="scrollerRef"
    class="virtual-tree"
    :items="itemsWithIndex"
    :item-size="itemHeight"
    :buffer="bufferSize"
    key-field="key"
    :emit-update="false"
    v-slot="{ item }"
  >
    <slot :node="(item as ItemWithIndex).node" :index="(item as ItemWithIndex)._index ?? 0" />
  </RecycleScroller>
  <div v-else class="virtual-tree static-list">
    <slot v-for="(node, index) in items" :key="node.key" :node="node" :index="index" />
  </div>
</template>

<script setup lang="ts" generic="T extends { key: string }">
import { computed, ref } from 'vue'
import { DynamicScroller, DynamicScrollerItem, RecycleScroller } from 'vue-virtual-scroller'
import 'vue-virtual-scroller/dist/vue-virtual-scroller.css'

defineOptions({ name: 'VirtualTree' })

interface ItemWithIndex {
  key: string
  node: T
  _index: number
}

const props = withDefaults(defineProps<{
  items: T[]
  threshold?: number
  itemHeight?: number
  bufferSize?: number
  dynamic?: boolean
}>(), {
  threshold: 50,
  itemHeight: 28,
  bufferSize: 200,
  dynamic: false
})

const scrollerRef = ref<InstanceType<typeof RecycleScroller> | InstanceType<typeof DynamicScroller> | null>(null)
const itemWrapperCache = new Map<string, ItemWithIndex>()

const shouldVirtualize = computed(() => props.items.length >= props.threshold)

const itemsWithIndex = computed(() => {
  const nextKeys = new Set<string>()
  const wrappers: ItemWithIndex[] = []

  for (let index = 0; index < props.items.length; index += 1) {
    const item = props.items[index]
    nextKeys.add(item.key)

    const cached = itemWrapperCache.get(item.key)
    if (cached) {
      cached.node = item
      cached._index = index
      wrappers.push(cached)
      continue
    }

    const wrapper: ItemWithIndex = {
      key: item.key,
      node: item,
      _index: index
    }
    itemWrapperCache.set(item.key, wrapper)
    wrappers.push(wrapper)
  }

  for (const key of [...itemWrapperCache.keys()]) {
    if (!nextKeys.has(key)) {
      itemWrapperCache.delete(key)
    }
  }

  return wrappers
})

function scrollToIndex(index: number): void {
  if (scrollerRef.value && shouldVirtualize.value) {
    scrollerRef.value.scrollToItem(index)
  }
}

function scrollToTop(): void {
  if (scrollerRef.value && shouldVirtualize.value) {
    scrollerRef.value.scrollToItem(0)
  }
}

defineExpose({
  scrollToIndex,
  scrollToTop,
  scrollerRef
})
</script>

<style scoped lang="scss">
.virtual-tree {
  display: block;
  flex: 1;
  width: 100%;
  height: 100%;
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
}

.static-list {
  display: block;
  width: 100%;
  min-height: 100%;
  align-self: stretch;
}
</style>
