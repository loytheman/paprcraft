<script setup>
import OpButton from '@ds/components/OpButton.vue';
import env from '../helpers/Environment.js';
import { cta } from '../data/content.js';
</script>

<template>
  <section class="px-4 pb-16 md:px-8 md:pb-24">
    <div class="relative mx-auto max-w-7xl overflow-hidden rounded-sheet bg-primary-active px-6 py-12 text-center md:px-12 md:py-16">
      <div class="pointer-events-none absolute -top-24 right-0 size-72 rounded-full bg-primary-bright/20 blur-3xl" aria-hidden="true" />
      <h2 class="relative mx-auto max-w-2xl text-h1 text-on-primary md:text-display">{{ cta.title }}</h2>
      <p class="relative mx-auto mt-3 max-w-xl text-body-lg text-primary-ink">{{ cta.body }}</p>
      <div class="relative mt-8 flex justify-center">
        <OpButton size="lg" variant="accent" icon-right="arrow-right" :href="env.signUpUrl">{{ cta.button }}</OpButton>
      </div>
    </div>
  </section>
</template>
