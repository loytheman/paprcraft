<script setup>
import OpButton from '@ds/components/OpButton.vue';
import env from '../helpers/Environment.js';
import { templates } from '../data/content.js';
</script>

<template>
  <section id="templates" class="mx-auto max-w-7xl px-4 py-16 md:px-8 md:py-24">
    <div class="flex flex-wrap items-end justify-between gap-4">
      <div class="max-w-2xl">
        <p class="eyebrow">Ready to use</p>
        <h2 class="mt-3 text-h1 text-ink">Start from a template</h2>
        <p class="mt-3 text-body-lg text-ink-muted">Clone a ready-made form and document, then change the wording and layout to fit.</p>
      </div>
      <OpButton variant="secondary" icon-right="arrow-right" :href="env.signUpUrl">Browse templates</OpButton>
    </div>
    <div class="mt-10 grid gap-6 md:grid-cols-3">
      <article v-for="t in templates" :key="t.title" class="flex flex-col overflow-hidden rounded-card border border-line bg-surface-1 transition hover:shadow-lift">
        <!-- A paper-like preview: skeleton lines -->
        <div class="border-b border-line-soft bg-canvas p-5" aria-hidden="true">
          <div class="rounded-control border border-line bg-surface-1 p-3 shadow-rim">
            <div class="h-2.5 w-2/5 rounded-sm bg-sunken" />
            <div class="mt-3 space-y-1.5"><div class="h-2 rounded-sm bg-line-faint" /><div class="h-2 w-5/6 rounded-sm bg-line-faint" /><div class="h-2 w-2/3 rounded-sm bg-line-faint" /></div>
            <div class="mt-3 h-2.5 w-1/2 rounded-sm bg-primary-edge" />
          </div>
        </div>
        <div class="flex flex-1 flex-col p-5">
          <div class="flex items-center justify-between">
            <span class="text-label font-semibold uppercase text-ink-faint">{{ t.tag }}</span>
            <span class="rounded-full border border-primary-edge bg-primary-soft px-2 py-0.5 text-label font-semibold uppercase text-primary-ink">{{ t.fmt }}</span>
          </div>
          <h3 class="mt-2 text-h3 text-ink">{{ t.title }}</h3>
          <p class="mt-2 flex-1 text-body text-ink-muted">{{ t.body }}</p>
          <p class="mt-4 text-small font-semibold text-primary-text">{{ t.foot }}</p>
        </div>
      </article>
    </div>
  </section>
</template>
