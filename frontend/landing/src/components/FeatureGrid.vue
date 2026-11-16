<script setup>
import OpIcon from '@ds/components/OpIcon.vue';
import { features } from '../data/content.js';
</script>

<template>
  <section id="features" class="py-20 md:py-28">
    <div class="mx-auto max-w-7xl px-4 md:px-8">
      <p class="eyebrow">Features</p>
      <h2 class="mt-3 max-w-3xl text-h2 text-ink md:text-h1">TODO: what paprcraft gives you</h2>

      <div class="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <article v-for="f in features" :key="f.title" class="flex flex-col rounded-card border border-line bg-surface-2 p-5 transition-colors hover:border-cyan/40">
          <span class="flex size-10 items-center justify-center rounded-control border border-line bg-surface-3 text-cyan">
            <OpIcon :name="f.icon" />
          </span>
          <span class="mt-5 font-mono text-label uppercase text-violet-soft">{{ f.tag }}</span>
          <h3 class="mt-1 text-h3 text-ink">{{ f.title }}</h3>
          <p class="mt-2 flex-1 text-body text-ink-muted">{{ f.body }}</p>
        </article>
      </div>

    </div>
  </section>
</template>
