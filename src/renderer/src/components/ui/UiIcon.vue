<template>
  <svg class="ui-icon" viewBox="0 0 16 16" aria-hidden="true">
    <path v-if="name === 'plus'" d="M8 3.25v9.5M3.25 8h9.5" />
    <path v-else-if="name === 'refresh'" d="M13.5 7.25A5.5 5.5 0 1 1 11.96 3.4M13.5 2.5v3.5H10" />
    <path v-else-if="name === 'play'" d="M5.25 3.5l6.25 4.5-6.25 4.5z" />
    <path v-else-if="name === 'pause'" d="M5.25 4v8M10.75 4v8" />
    <path v-else-if="name === 'trash'" d="M3.5 5.25h9M6.25 5.25V3.5h3.5v1.75M5 5.25l.5 7.25h5l.5-7.25M7 7.25v3.25M9 7.25v3.25" />
    <path v-else-if="name === 'settings'" d="M8 5.75a2.25 2.25 0 1 0 0 4.5 2.25 2.25 0 0 0 0-4.5ZM8 2.75v1.2M8 12.05v1.2M12.55 5.38l-1.04.6M4.49 10.02l-1.04.6M12.55 10.62l-1.04-.6M4.49 5.98l-1.04-.6" />
    <path v-else-if="name === 'edit'" d="M11.5 2.75l1.75 1.75M3.25 11.25v1.5h1.5l7-7-1.5-1.5-7 7z" />
    <path v-else-if="name === 'folder'" d="M2.5 4.25h4l1.25 1.5h5.75v6H2.5z" />
    <path v-else-if="name === 'x'" d="M4.25 4.25l7.5 7.5M11.75 4.25l-7.5 7.5" />
    <path
      v-else-if="name === 'list-left'"
      d="M2.75 3.25h10.5v9.5H2.75zM5.5 3.25v9.5M7.5 5.5h4M7.5 8h2.5M7.5 10.5h4"
    />
    <path
      v-else-if="name === 'list-top'"
      d="M2.75 3.25h10.5v9.5H2.75zM2.75 5.75h10.5M4.5 8.25h2.25M8 8.25h3.5M8 12.5V8.75M6.5 10.25 8 8.75l1.5 1.5"
    />
    <path v-else-if="name === 'terminal'" d="M2.75 3.75h10.5v8.5H2.75zM5 6.25 7 8l-2 1.75M8.25 9.75h2.75" />
    <path v-else-if="name === 'arrow-left'" d="M12 8H4M7.5 4.5 4 8l3.5 3.5" />
    <path v-else-if="name === 'arrow-right'" d="M4 8h8M8.5 4.5 12 8l-3.5 3.5" />
    <path v-else-if="name === 'git-graph'" d="M8 5v3M5 11l2-2M11 11 9 9M8 1.75a2 2 0 1 0 0 4 2 2 0 0 0 0-4ZM3 10.25a2 2 0 1 0 0 4 2 2 0 0 0 0-4ZM13 10.25a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z" />
    <path v-else-if="name === 'history'" d="M3.75 4.25A5.5 5.5 0 1 1 2.5 7.75M2.5 3.25v3.5H6M8 4.75V8l2.25 1.5" />
    <path v-else-if="name === 'link'" d="M6.5 9.5l3-3M9 4h2a3 3 0 0 1 0 6H9M7 12H5a3 3 0 0 1 0-6h2" />
    <path v-else-if="name === 'branch'" d="M4 4v8M4 8c0-2 1-3 3-3h2c2 0 3-1 3-3" />
    <path v-else-if="name === 'globe'" d="M8 2.75a5.25 5.25 0 1 0 0 10.5 5.25 5.25 0 0 0 0-10.5ZM2.75 8h10.5M8 2.75c1.35 1.42 2.02 3.17 2.02 5.25S9.35 11.83 8 13.25M8 2.75C6.65 4.17 5.98 5.92 5.98 8S6.65 11.83 8 13.25" />
    <path v-else-if="name === 'check'" d="M3.25 8.25 6.25 11.25 12.75 4.75" />
    <path v-else-if="name === 'search'" d="M7.25 12.25a5 5 0 1 1 0-10 5 5 0 0 1 0 10ZM11 11l2.75 2.75" />
    <path v-else-if="name === 'arrow-up-to-line'" d="M8 12.5V4M4.75 7.25 8 4l3.25 3.25M4 2.5h8" />
    <path v-else-if="name === 'arrow-down-to-line'" d="M8 3.5V12M4.75 8.75 8 12l3.25-3.25M4 13.5h8" />
    <path v-else-if="name === 'copy'" d="M5.25 5.25h7v7h-7zM3.75 10.75h-1v-8h8v1" />
    <path v-else-if="name === 'eraser'" d="M10.75 3.75 13 6l-5.75 5.75H4.5L3 10.25 8.75 4.5a1.4 1.4 0 0 1 2 0ZM2.75 13.25h10.5" />
    <path v-else-if="name === 'offline'" d="M3 8a5 5 0 0 1 8.05-3.96M13 8a5 5 0 0 1-8.05 3.96M6.25 6.25h3.5v3.5h-3.5zM3.25 3.25l9.5 9.5" />
    <path v-else-if="name === 'desktop'" d="M2.75 3.5h10.5v7.25H2.75zM6 13h4M8 10.75V13" />
    <path v-else-if="name === 'chevron-right'" d="M6 4l4 4-4 4" />
    <path v-else-if="name === 'chevron-left'" d="M10 4L6 8l4 4" />
    <path v-else-if="name === 'chevron-down'" d="M4 6l4 4 4-4" />
    <path v-else-if="name === 'chevron-up'" d="M4 10l4-4 4 4" />
  </svg>
</template>

<script setup lang="ts">
defineProps<{
  name:
    | 'plus'
    | 'refresh'
    | 'play'
    | 'pause'
    | 'trash'
    | 'settings'
    | 'edit'
    | 'folder'
    | 'x'
    | 'list-left'
    | 'list-top'
    | 'terminal'
    | 'arrow-left'
    | 'arrow-right'
    | 'git-graph'
    | 'history'
    | 'link'
    | 'branch'
    | 'globe'
    | 'check'
    | 'search'
    | 'arrow-up-to-line'
    | 'arrow-down-to-line'
    | 'copy'
    | 'eraser'
    | 'offline'
    | 'desktop'
    | 'chevron-right'
    | 'chevron-left'
    | 'chevron-down'
    | 'chevron-up'
}>()
</script>

<style scoped lang="scss">
.ui-icon {
  width: 1em;
  height: 1em;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.7;
}
</style>
