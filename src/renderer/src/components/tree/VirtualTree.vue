<template>
  <RecycleScroller
    v-if="shouldVirtualize"
    ref="scrollerRef"
    class="virtual-tree"
    :items="itemsWithIndex"
    :item-size="itemHeight"
    :buffer="bufferSize"
    key-field="key"
    :emit-update="false"
    v-slot="{ item }"
  >
    <slot :node="(item as T)" :index="(item as ItemWithIndex)._index ?? 0" />
  </RecycleScroller>
  <div v-else class="virtual-tree static-list" style="overflow: visible;">
    <slot v-for="(node, index) in items" :key="node.key" :node="node" :index="index" />
  </div>
</template>

<script setup lang="ts" generic="T extends { key: string }">
import { computed, ref } from 'vue'
import { RecycleScroller } from 'vue-virtual-scroller'
import 'vue-virtual-scroller/dist/vue-virtual-scroller.css'

defineOptions({ name: 'VirtualTree' })

interface ItemWithIndex {
  key: string
  _index: number
}

const props = withDefaults(defineProps<{
  items: T[]
  threshold?: number
  itemHeight?: number
  bufferSize?: number
}>(), {
  threshold: 50,
  itemHeight: 28,
  bufferSize: 200
})

const scrollerRef = ref<InstanceType<typeof RecycleScroller> | null>(null)

const shouldVirtualize = computed(() => props.items.length >= props.threshold)

const itemsWithIndex = computed(() => {
  return props.items.map((item, index) => ({
    ...item,
    _index: index
  }))
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
  flex: 1;
  min-height: 0;
  overflow: auto;
}

.static-list {
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
}
</style>