<script setup>
import OpIcon from '@ds/components/OpIcon.vue';
import env from '../helpers/Environment.js';
import { cta } from '../data/content.js';
</script>

<template>
  <section class="px-4 pb-16 md:px-8 md:pb-24">
    <div class="cta relative mx-auto max-w-7xl overflow-hidden rounded-sheet px-6 py-12 shadow-lift md:px-14 md:py-16">
      <div class="relative max-w-3xl">
        <p class="inline-flex items-center gap-2 rounded-full bg-secondary-bright px-3.5 py-1.5 text-label uppercase text-secondary-ink">
          <OpIcon name="zap" :size="14" /> {{ cta.eyebrow }}
        </p>
        <h2 class="mt-5 text-h1 text-on-cta md:text-display md:!text-[3.25rem] md:!leading-[1.1]">{{ cta.title }}</h2>
        <p class="mt-4 max-w-2xl text-body-lg text-cta-muted">{{ cta.body }}</p>
        <div class="mt-8 flex flex-wrap gap-3">
          <a :href="env.signUpUrl" class="inline-flex h-12 items-center gap-2 rounded-control bg-secondary-bright px-6 text-body font-semibold text-secondary-ink shadow-lift transition-transform hover:-translate-y-0.5">{{ cta.button }} <OpIcon name="arrow-right" :size="16" /></a>
          <a :href="cta.secondaryHref" class="inline-flex h-12 items-center gap-2 rounded-control border border-white/25 bg-white/10 px-5 text-body font-medium text-on-cta backdrop-blur transition-colors hover:bg-white/20">
            <OpIcon name="play" :size="16" /> {{ cta.secondary }}
          </a>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
/* Deep brand colour with a soft light pool bottom-left and an accent glow top-right. White text is
   safe because the base is the darkest brand step. */
.cta {
  --cta-base: color-mix(in srgb, var(--color-primary-ink) 82%, black);
  background:
    radial-gradient(60% 90% at 0% 100%, color-mix(in srgb, var(--color-primary-bright) 38%, transparent), transparent 70%),
    radial-gradient(45% 80% at 100% 0%, color-mix(in srgb, var(--color-accent-lime) 45%, transparent), transparent 70%),
    var(--cta-base);
}
.text-on-cta { color: #fff; }
.text-cta-muted { color: color-mix(in srgb, white 78%, var(--color-primary-bright)); }
</style>
