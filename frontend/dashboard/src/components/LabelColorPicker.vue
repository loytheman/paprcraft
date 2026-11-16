<script setup>
// Colour swatches for a label, as a radio group.
import { LABEL_COLORS, labelColorNames } from '@ds/lib/labels.js';

const model = defineModel({ type: String, default: 'cyan' });
defineProps({ label: { type: String, default: 'Colour' } });
</script>

<template>
  <div role="radiogroup" :aria-label="label" class="flex flex-wrap gap-1.5">
    <button
      v-for="c in labelColorNames"
      :key="c"
      type="button"
      role="radio"
      :aria-checked="model === c"
      :aria-label="c"
      :title="c"
      class="flex size-7 items-center justify-center rounded-full border transition-colors"
      :class="model === c ? 'border-ink' : 'border-transparent hover:border-line-strong'"
      @click="model = c"
    >
      <span class="size-4 rounded-full" :style="{ backgroundColor: LABEL_COLORS[c] }" />
    </button>
  </div>
</template>
