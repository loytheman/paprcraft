<script setup>
// The Paprcraft Prism mark (four folded facets: forest, mint, gold, peach) and the wordmark. Master
// artwork: brand/paprcraft-prism.svg. The mark keeps its own colours on every theme.
defineProps({
  size: { type: [Number, String], default: 28 },
  wordmark: { type: Boolean, default: true },
});
</script>

<template>
  <span class="inline-flex items-center gap-2">
    <svg :width="size" :height="size" viewBox="56 64 400 400" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="pc-forest" gradientUnits="userSpaceOnUse" x1="60" y1="90" x2="256" y2="340"><stop offset="0" stop-color="#047857" /><stop offset="1" stop-color="#064e3b" /></linearGradient>
        <linearGradient id="pc-mint" gradientUnits="userSpaceOnUse" x1="256" y1="90" x2="452" y2="240"><stop offset="0" stop-color="#34d399" /><stop offset="1" stop-color="#10b981" /></linearGradient>
        <linearGradient id="pc-gold" gradientUnits="userSpaceOnUse" x1="256" y1="240" x2="452" y2="420"><stop offset="0" stop-color="#fbbf24" /><stop offset="1" stop-color="#d97706" /></linearGradient>
        <linearGradient id="pc-peach" gradientUnits="userSpaceOnUse" x1="160" y1="420" x2="256" y2="240"><stop offset="0" stop-color="#fed7aa" /><stop offset="1" stop-color="#fde68a" /></linearGradient>
      </defs>
      <polygon points="68,96 256,96 256,340 184,432" fill="url(#pc-forest)" />
      <polygon points="256,96 444,244 256,340" fill="url(#pc-mint)" />
      <polygon points="444,244 380,432 256,340" fill="url(#pc-gold)" />
      <polygon points="184,432 256,340 380,432" fill="url(#pc-peach)" />
    </svg>
    <span v-if="wordmark" class="text-h3 font-bold tracking-tight text-ink">Paprcraft</span>
  </span>
</template>
