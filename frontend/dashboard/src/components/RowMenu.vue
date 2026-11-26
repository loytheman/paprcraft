<script setup>
// The 3-dot menu at the end of a list row, for its secondary actions (Duplicate, Delete...); the
// row's main action (Open / Edit) stays a visible button. items: [{ label, icon?, action, danger?,
// disabled? }]; hidden when there are none. Closes on a pick, an outside click or Escape.
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import OpIcon from '@ds/components/OpIcon.vue';

const props = defineProps({
  items: { type: Array, required: true },
  label: { type: String, default: 'More actions' }, // the button's accessible name, e.g. "More actions for Acme"
});

const open = ref(false);
const root = ref(null);
const menu = ref(null);
const onDoc = (e) => { if (open.value && !root.value?.contains(e.target)) open.value = false; };
const onKey = (e) => { if (e.key === 'Escape') open.value = false; };
onMounted(() => { document.addEventListener('mousedown', onDoc); document.addEventListener('keydown', onKey); });
onBeforeUnmount(() => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); });

const toggle = async () => {
  open.value = !open.value;
  if (!open.value) return;
  await nextTick();
  menu.value?.querySelector('button:not(:disabled)')?.focus();
};
const pick = (item) => {
  if (item.disabled) return;
  open.value = false;
  item.action?.();
};
</script>

<template>
  <div v-if="props.items.length" ref="root" class="relative inline-block">
    <button
      type="button"
      :aria-label="label"
      :title="label"
      aria-haspopup="menu"
      :aria-expanded="open"
      :class="['inline-flex size-8 items-center justify-center rounded-control border border-transparent text-ink-muted transition-colors hover:border-line hover:text-ink', open && '!border-line bg-ink/4 text-ink']"
      @click="toggle"
    >
      <OpIcon name="more-vertical" :size="16" />
    </button>
    <div v-if="open" ref="menu" role="menu" class="absolute right-0 top-full z-30 mt-1 min-w-40 overflow-hidden rounded-card border border-line bg-surface-3 py-1 shadow-rim">
      <button
        v-for="(item, i) in items"
        :key="i"
        type="button"
        role="menuitem"
        :disabled="item.disabled"
        :class="['flex w-full items-center gap-2 px-3 py-1.5 text-left text-body hover:bg-ink/4 focus:bg-ink/4 focus:outline-none disabled:cursor-not-allowed disabled:opacity-40', item.danger ? 'text-down' : 'text-ink-muted hover:text-ink']"
        @click="pick(item)"
      >
        <OpIcon v-if="item.icon" :name="item.icon" :size="14" />
        {{ item.label }}
      </button>
    </div>
  </div>
</template>
