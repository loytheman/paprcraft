<script setup>
// Placeholder mark: a mint tile with a P and a lemon dot. Replace when the real logo exists.
defineProps({
  size: { type: [Number, String], default: 28 },
  wordmark: { type: Boolean, default: true },
});
</script>

<template>
  <span class="inline-flex items-center gap-2">
    <svg :width="size" :height="size" viewBox="0 0 32 32" aria-hidden="true">
      <rect x="2" y="2" width="28" height="28" rx="8" class="fill-primary" />
      <path d="M10 22V10h6.2a3.8 3.8 0 0 1 0 7.6H10" fill="none" class="stroke-ink-inverse" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" />
      <circle cx="22.5" cy="9.5" r="2.2" class="fill-secondary-bright" />
    </svg>
    <span v-if="wordmark" class="text-h3 font-semibold tracking-tight text-ink">Paprcraft</span>
  </span>
</template>
