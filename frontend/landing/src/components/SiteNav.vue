<script setup>
import { ref } from 'vue';
import OpLogo from '@ds/components/OpLogo.vue';
import OpGoogleButton from '@ds/components/OpGoogleButton.vue';
import OpIcon from '@ds/components/OpIcon.vue';
import env from '../helpers/Environment.js';
import { navLinks } from '../data/content.js';

// base: '/' on pages other than the landing page, so the #section links still reach it.
const props = defineProps({ base: { type: String, default: '' } });
const to = (href) => (href.startsWith('#') ? props.base + href : href);
const open = ref(false);
</script>

<template>
  <header class="sticky top-0 z-50 border-b border-line-soft bg-canvas/80 backdrop-blur-md">
    <div class="mx-auto flex h-16 max-w-7xl items-center justify-between gap-6 px-4 md:px-8">
      <a :href="to('#top')" aria-label="Paprcraft home"><OpLogo /></a>

      <nav class="hidden items-center gap-7 md:flex" aria-label="Main">
        <a v-for="l in navLinks" :key="l.href" :href="to(l.href)" class="text-body text-ink-muted transition-colors hover:text-ink">{{ l.label }}</a>
      </nav>

      <!-- One button for both: Google sign-in creates the account on first use. -->
      <div class="hidden md:block">
        <OpGoogleButton size="sm" :href="env.signInUrl" />
      </div>

      <button
        class="inline-flex size-10 items-center justify-center rounded-control border border-line text-ink md:hidden"
        :aria-expanded="open"
        aria-controls="mobile-nav"
        :aria-label="open ? 'Close menu' : 'Open menu'"
        @click="open = !open"
      >
        <OpIcon :name="open ? 'x' : 'menu'" />
      </button>
    </div>

    <nav v-if="open" id="mobile-nav" class="border-t border-line-soft bg-surface-1 px-4 py-4 md:hidden" aria-label="Main">
      <a
        v-for="l in navLinks"
        :key="l.href"
        :href="to(l.href)"
        class="block py-2.5 text-body-lg text-ink-muted hover:text-ink"
        @click="open = false"
      >{{ l.label }}</a>
      <OpGoogleButton class="mt-3" block :href="env.signInUrl" />
    </nav>
  </header>
</template>
