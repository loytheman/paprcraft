<script setup>
import OpButton from '@ds/components/OpButton.vue';
import OpIcon from '@ds/components/OpIcon.vue';
import env from '../helpers/Environment.js';
import { hero } from '../data/content.js';
</script>

<template>
  <section id="top" class="relative overflow-hidden">
    <div class="pointer-events-none absolute -top-40 right-1/4 h-[540px] w-[540px] rounded-full bg-primary/10 blur-3xl" aria-hidden="true" />
    <div class="pointer-events-none absolute top-20 left-10 h-[380px] w-[380px] rounded-full bg-secondary-bright/10 blur-3xl" aria-hidden="true" />

    <div class="relative mx-auto grid max-w-7xl items-center gap-8 px-4 pt-10 pb-16 md:px-8 lg:grid-cols-2 lg:gap-12 lg:pt-16 lg:pb-24">
      <div class="flex flex-col items-start">
        <span class="mb-6 inline-flex items-center gap-2 rounded-full border border-secondary-edge bg-secondary-soft px-3 py-1 text-label font-semibold uppercase text-secondary-ink">
          <span class="size-2 rounded-full bg-secondary-bright animate-live text-secondary-bright" />
          {{ hero.badge }}
        </span>

        <h1 class="text-[2.25rem] leading-[1.15] font-bold tracking-[-0.03em] text-ink sm:text-display">
          {{ hero.headlineLead }}
          <span class="text-primary underline decoration-secondary-bright decoration-4 underline-offset-4">{{ hero.headlineAccent }}</span>
          {{ hero.headlineTail }}
        </h1>

        <p class="mt-5 max-w-xl text-body-lg text-ink-muted">{{ hero.body }}</p>

        <div class="mt-8 flex flex-wrap items-center gap-3">
          <OpButton size="lg" icon-right="arrow-right" :href="env.signUpUrl" class="shadow-glow-sm">Get started with Google</OpButton>
          <OpButton size="lg" variant="secondary" href="#how-it-works">See how it works</OpButton>
        </div>

        <ul class="mt-8 flex w-full flex-wrap items-center gap-x-6 gap-y-3 rounded-sheet border border-line-soft bg-surface-3/70 px-4 py-3 text-small font-medium text-ink-muted">
          <li v-for="f in hero.facts" :key="f.text" class="flex items-center gap-2">
            <OpIcon :name="f.icon" :size="16" class="text-primary" />
            {{ f.text }}
          </li>
        </ul>
      </div>

      <!-- Illustration: answers become a document. Pure markup, no images. -->
      <div class="relative mx-auto w-full max-w-[560px]" aria-hidden="true">
        <div class="rounded-sheet border border-line bg-surface-1 p-2 shadow-pop">
          <div class="grid gap-3 rounded-card bg-canvas p-4 sm:grid-cols-[1fr_auto_1fr] sm:items-stretch">
            <!-- The form -->
            <div class="rounded-card border border-line bg-surface-1 p-4">
              <p class="text-label font-semibold uppercase text-primary-text">Customer form</p>
              <div class="mt-3 space-y-3">
                <div><p class="text-small text-ink-faint">Full name</p><div class="mt-1 rounded-control border border-line-strong px-2.5 py-1.5 text-body text-ink">Jane Tan</div></div>
                <div><p class="text-small text-ink-faint">Date of birth</p><div class="mt-1 rounded-control border border-line-strong px-2.5 py-1.5 text-body text-ink">1990-08-03</div></div>
                <div><p class="text-small text-ink-faint">Is a PEP?</p>
                  <div class="mt-1 flex gap-3 text-small text-ink-muted">
                    <span class="inline-flex items-center gap-1.5"><span class="size-3.5 rounded-full border border-line-strong" />Yes</span>
                    <span class="inline-flex items-center gap-1.5"><span class="size-3.5 rounded-full border-4 border-primary" />No</span>
                  </div>
                </div>
              </div>
            </div>
            <div class="flex items-center justify-center text-primary"><span class="flex size-9 items-center justify-center rounded-full bg-primary-soft"><OpIcon name="arrow-right" :size="18" /></span></div>
            <!-- The document -->
            <div class="rounded-card border border-line bg-surface-1 p-4 shadow-rim">
              <div class="rounded-sm bg-sunken px-2 py-1 text-small font-semibold text-ink">Customer Information</div>
              <div class="mt-2 grid grid-cols-2 gap-x-3 gap-y-2 text-small">
                <div><p class="text-label text-ink-faint">Full Name</p><p class="font-semibold text-ink">JANE TAN</p></div>
                <div><p class="text-label text-ink-faint">Date of Birth</p><p class="font-semibold text-ink">03 AUG 1990</p></div>
              </div>
              <div class="mt-3 rounded-sm border border-line px-2 py-1.5 text-small text-ink-muted">
                <p>1. Is the customer a PEP?</p>
                <p class="mt-0.5 font-semibold text-ink">☐ YES &nbsp;☒ NO</p>
              </div>
              <span class="mt-3 inline-flex rounded-full border border-primary-edge bg-primary-soft px-2 py-0.5 text-label font-semibold uppercase text-primary-ink">.docx</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
