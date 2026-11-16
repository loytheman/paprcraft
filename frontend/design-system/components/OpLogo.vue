<script setup>
// Placeholder mark: a disc with a pulse trace through it. Replace when the real logo exists.
defineProps({
  size: { type: [Number, String], default: 28 },
  wordmark: { type: Boolean, default: true },
});
</script>

<template>
  <span class="inline-flex items-center gap-2">
    <svg :width="size" :height="size" viewBox="0 0 32 32" aria-hidden="true">
      <circle cx="16" cy="16" r="14" fill="#131b2e" stroke="#00f0ff" stroke-opacity="0.5" stroke-width="1.5" />
      <path d="M5 16h6l2.5-6 4 12 2.5-6H27" fill="none" stroke="#00f0ff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
    <span v-if="wordmark" class="text-h3 font-semibold tracking-tight text-ink">Paprcraft</span>
  </span>
</template>
