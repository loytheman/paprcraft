<script setup>
import OpIcon from '@ds/components/OpIcon.vue';
import { features } from '../data/content.js';
</script>

<template>
  <section id="features" class="bg-surface-1 py-16 md:py-24">
    <div class="mx-auto max-w-7xl px-4 md:px-8">
      <div class="max-w-2xl">
        <p class="eyebrow">Built for document work</p>
        <h2 class="mt-3 text-h1 text-ink">Everything between a question and a signed document</h2>
        <p class="mt-3 text-body-lg text-ink-muted">One place for the template, the data, the approval and the paper trail.</p>
      </div>
      <div class="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <article v-for="f in features" :key="f.title" class="flex flex-col rounded-card border border-line bg-surface-2 p-5 transition hover:border-line-strong hover:shadow-lift">
          <span class="flex size-10 items-center justify-center rounded-control bg-primary-soft text-primary-text"><OpIcon :name="f.icon" /></span>
          <span class="mt-4 text-label font-semibold uppercase text-ink-faint">{{ f.tag }}</span>
          <h3 class="mt-1 text-h3 text-ink">{{ f.title }}</h3>
          <p class="mt-2 text-body text-ink-muted">{{ f.body }}</p>
        </article>
      </div>
    </div>
  </section>
</template>
