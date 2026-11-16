<script setup>
// A small dropdown button. items: [{ label, action?, disabled?, heading?: true, icon? }]. The
// trigger swallows mousedown so opening it doesn't take the caret out of the text being edited.
import { onBeforeUnmount, onMounted, ref } from 'vue';
import OpIcon from '@ds/components/OpIcon.vue';

defineProps({
  label: { type: String, default: '' },
  icon: { type: String, default: '' },
  items: { type: Array, required: true },
  align: { type: String, default: 'left' }, // left | right
  title: { type: String, default: '' },
  disabled: { type: Boolean, default: false },
  buttonClass: { type: String, default: '' },
});

const open = ref(false);
const root = ref(null);
const onDoc = (e) => { if (open.value && !root.value?.contains(e.target)) open.value = false; };
const onKey = (e) => { if (e.key === 'Escape') open.value = false; };
onMounted(() => { document.addEventListener('mousedown', onDoc); document.addEventListener('keydown', onKey); });
onBeforeUnmount(() => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); });

const pick = (item) => {
  if (item.disabled || item.heading) return;
  open.value = false;
  item.action?.();
};
</script>

<template>
  <div ref="root" class="relative inline-block">
    <button
      type="button"
      :disabled="disabled"
      :title="title || undefined"
      :aria-label="title || label || undefined"
      aria-haspopup="menu"
      :aria-expanded="open"
      :class="['inline-flex h-8 items-center gap-1.5 rounded-control border border-transparent px-2 text-small text-ink-muted transition-colors hover:text-ink disabled:cursor-not-allowed disabled:opacity-40', open && '!border-line bg-white/4', buttonClass]"
      @mousedown.prevent
      @click="open = !open"
    >
      <OpIcon v-if="icon" :name="icon" :size="15" />
      <span v-if="label">{{ label }}</span>
      <OpIcon name="chevron-down" :size="12" class="text-ink-faint" />
    </button>
    <div
      v-if="open"
      role="menu"
      :class="['absolute top-full z-30 mt-1 max-h-80 min-w-44 overflow-auto rounded-card border border-line bg-surface-3 py-1 shadow-rim', align === 'right' ? 'right-0' : 'left-0']"
    >
      <template v-for="(item, i) in items" :key="i">
        <p v-if="item.heading" class="px-3 pt-2 pb-1 font-mono text-label uppercase text-ink-faint">{{ item.label }}</p>
        <button
          v-else
          type="button"
          role="menuitem"
          :disabled="item.disabled"
          class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-body text-ink-muted hover:bg-white/4 hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
          @mousedown.prevent
          @click="pick(item)"
        >
          <OpIcon v-if="item.icon" :name="item.icon" :size="14" />
          {{ item.label }}
        </button>
      </template>
    </div>
  </div>
</template>
