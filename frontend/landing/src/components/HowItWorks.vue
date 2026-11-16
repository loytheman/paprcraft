<script setup>
import OpIcon from '@ds/components/OpIcon.vue';
import { steps } from '../data/content.js';
</script>

<template>
  <section id="how-it-works" class="mx-auto max-w-7xl px-4 py-16 md:px-8 md:py-24">
    <div class="text-center">
      <p class="eyebrow">Simple 3-step flow</p>
      <h2 class="mt-3 text-h1 text-ink">How Paprcraft works</h2>
      <p class="mx-auto mt-3 max-w-xl text-body-lg text-ink-muted">From a blank page to a finished document in three steps.</p>
    </div>
    <div class="mt-12 grid gap-6 md:grid-cols-3">
      <article v-for="(s, i) in steps" :key="s.n" :class="['flex flex-col rounded-card border border-line bg-surface-1 p-6 border-t-4 transition-shadow hover:shadow-lift', i === 1 ? 'border-t-secondary-bright' : 'border-t-primary']">
        <div class="flex items-center justify-between">
          <span class="flex size-8 items-center justify-center rounded-full bg-primary-soft text-small font-bold text-primary-ink">{{ s.n }}</span>
          <span class="rounded-full border border-line bg-sunken px-2.5 py-0.5 text-label font-semibold uppercase text-ink-muted">{{ s.tag }}</span>
        </div>
        <h3 class="mt-5 text-h3 text-ink">{{ s.title }}</h3>
        <p class="mt-2 flex-1 text-body text-ink-muted">{{ s.body }}</p>
        <p class="mt-5 inline-flex items-center gap-2 rounded-control bg-primary-soft px-3 py-2 text-small font-medium text-primary-ink"><OpIcon :name="s.foot.icon" :size="16" />{{ s.foot.text }}</p>
      </article>
    </div>
  </section>
</template>
