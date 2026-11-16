<script setup>
// Status chip with a dot. `live` pulses the dot (use for the current, streaming state only).
import { computed } from 'vue';

const props = defineProps({
  status: { type: String, default: 'ok' }, // ok | warn | down | info
  live: { type: Boolean, default: false },
});

const tone = computed(() => ({ ok: 'status-ok', warn: 'status-warn', down: 'status-down', info: 'status-info' })[props.status]);
const dot = computed(() => ({ ok: 'bg-ok', warn: 'bg-warn', down: 'bg-down', info: 'bg-cyan' })[props.status]);
</script>

<template>
  <span :class="['inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 font-mono text-label uppercase', tone]">
    <span :class="['size-1.5 rounded-full', dot, live && 'animate-live']" />
    <slot />
  </span>
</template>
