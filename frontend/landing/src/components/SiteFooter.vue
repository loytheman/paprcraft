<script setup>
import OpLogo from '@ds/components/OpLogo.vue';
import { footerColumns } from '../data/content.js';

const props = defineProps({ base: { type: String, default: '' } });
const to = (href) => (href.startsWith('#') ? props.base + href : href);
const year = new Date().getFullYear();
</script>

<template>
  <footer class="border-t border-line-soft bg-surface-1">
    <div class="mx-auto grid max-w-7xl gap-10 px-4 py-12 md:grid-cols-[2fr_1fr_1fr] md:px-8">
      <div>
        <OpLogo />
        <p class="mt-3 max-w-sm text-body text-ink-muted">
          TODO: one line about paprcraft.
        </p>
      </div>
      <div v-for="col in footerColumns" :key="col.title">
        <p class="font-mono text-label uppercase text-ink-faint">{{ col.title }}</p>
        <ul class="mt-4 space-y-2.5">
          <li v-for="l in col.links" :key="l.href">
            <a :href="to(l.href)" class="text-body text-ink-muted transition-colors hover:text-ink">{{ l.label }}</a>
          </li>
        </ul>
      </div>
    </div>
    <div class="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 border-t border-line-soft px-4 py-5 md:px-8">
      <p class="font-mono text-small text-ink-faint">© {{ year }} Paprcraft</p>
    </div>
  </footer>
</template>
