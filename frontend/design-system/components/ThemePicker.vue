<script setup>
// Floating colour-theme menu: a round button in the corner that opens a list of palettes.
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { THEMES, applyStoredTheme, applyTheme } from '../lib/themes.js';

const open = ref(false);
const current = ref(applyStoredTheme()); // applied during setup, before the first paint of the page
const root = ref(null);
const pick = (id) => { current.value = id; applyTheme(id); };
const onDoc = (e) => { if (open.value && !root.value?.contains(e.target)) open.value = false; };
const onKey = (e) => { if (e.key === 'Escape') open.value = false; };
onMounted(() => { document.addEventListener('click', onDoc); document.addEventListener('keydown', onKey); });
onBeforeUnmount(() => { document.removeEventListener('click', onDoc); document.removeEventListener('keydown', onKey); });
</script>

<template>
  <div ref="root" class="fixed right-4 bottom-4 z-50 flex flex-col items-end gap-2">
    <div v-if="open" class="max-h-[70dvh] w-72 overflow-y-auto rounded-card border border-line bg-surface-1 p-2 shadow-modal" role="listbox" aria-label="Colour theme">
      <p class="px-2 pt-1 pb-2 text-label uppercase text-ink-faint">Colour theme</p>
      <button
        v-for="t in THEMES"
        :key="t.id"
        type="button"
        role="option"
        :aria-selected="current === t.id"
        class="flex w-full items-center justify-between gap-3 rounded-control px-2 py-2 text-left text-body transition-colors hover:bg-sunken"
        :class="current === t.id ? 'bg-primary-soft text-ink' : 'text-ink-muted'"
        @click="pick(t.id)"
      >
        <span class="truncate">{{ t.name }}</span>
        <span class="flex shrink-0 overflow-hidden rounded-full border border-line" aria-hidden="true">
          <span v-for="c in t.colors" :key="c" class="size-4" :style="{ background: c }"></span>
        </span>
      </button>
    </div>
    <button type="button" class="flex size-12 items-center justify-center rounded-full border border-line bg-surface-1 shadow-lift transition-shadow hover:shadow-glow-sm" aria-label="Choose colour theme" :aria-expanded="open" @click.stop="open = !open">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M12 3a9 9 0 1 0 0 18c1.1 0 1.8-.8 1.8-1.7 0-.5-.2-.9-.5-1.3-.3-.4-.5-.8-.5-1.3 0-1 .8-1.7 1.8-1.7H17a4 4 0 0 0 4-4c0-4.4-4-8-9-8Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" class="text-ink" />
        <circle cx="7.5" cy="11.5" r="1.3" class="fill-primary" /><circle cx="10.5" cy="7.5" r="1.3" class="fill-secondary-bright" /><circle cx="15" cy="7.8" r="1.3" class="fill-accent-lime" />
      </svg>
    </button>
  </div>
</template>
