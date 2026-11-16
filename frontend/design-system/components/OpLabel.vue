<script setup>
// A monitor label chip. Colour keys come from lib/labels.js.
import { computed } from 'vue';
import { labelStyle } from '../lib/labels.js';

const props = defineProps({
  name: { type: String, required: true },
  color: { type: String, default: 'slate' },
});
const style = computed(() => labelStyle(props.color));
</script>

<template>
  <span class="inline-flex max-w-full items-center gap-1 rounded-full border px-2 py-px text-small leading-4" :style="style">
    <span class="truncate">{{ name }}</span>
    <slot />
  </span>
</template>
