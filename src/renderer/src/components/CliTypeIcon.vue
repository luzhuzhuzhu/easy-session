<template>
  <span
    v-if="iconMarkup"
    class="cli-type-icon cli-type-icon-svg"
    v-html="iconMarkup"
    aria-hidden="true"
  />
  <img
    v-else
    class="cli-type-icon cli-type-icon-image"
    :src="imageUrl"
    alt=""
    aria-hidden="true"
  />
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { CliType } from '@shared/cli-types'
import claudeIcon from '@lobehub/icons-static-svg/icons/claudecode-color.svg?raw'
import codexIcon from '@lobehub/icons-static-svg/icons/codex-color.svg?raw'
import openCodeIcon from '@lobehub/icons-static-svg/icons/opencode.svg?raw'
import geminiIcon from '@lobehub/icons-static-svg/icons/geminicli-color.svg?raw'
import piIcon from '@lobehub/icons-static-svg/icons/pi.svg?raw'
import grokIcon from '@lobehub/icons-static-svg/icons/grok.svg?raw'
import hermesIcon from '@lobehub/icons-static-svg/icons/hermesagent.svg?raw'
import terminalIcon from '@/assets/logo-easy-session-light.png'

const props = defineProps<{
  type: CliType
}>()

const iconMarkupByType: Partial<Record<CliType, string>> = {
  claude: claudeIcon,
  codex: codexIcon,
  opencode: openCodeIcon,
  gemini: geminiIcon,
  pi: piIcon,
  grok: grokIcon,
  hermes: hermesIcon,
  omp: piIcon
}

const iconMarkup = computed(() => iconMarkupByType[props.type] ?? '')
const imageUrl = terminalIcon
</script>

<style scoped>
.cli-type-icon {
  display: block;
  width: 1.55rem;
  height: 1.55rem;
  flex: 0 0 auto;
  object-fit: contain;
}

.cli-type-icon-svg :deep(svg) {
  display: block;
  width: 100%;
  height: 100%;
}
</style>
