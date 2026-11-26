<script setup>
// Click a chip in the text: see that key's value in the selected data source (values are changed on
// the Data sources page), or turn the chip back into plain text. Opens where the chip is (the editor dispatches `placeholder-clicked` on window).
import { onBeforeUnmount, onMounted, shallowRef } from 'vue';
import OpButton from '@ds/components/OpButton.vue';

const props = defineProps({
  placeholders: { type: Object, required: true }, // the template's keys
  values: { type: Object, default: null }, // the selected data source's values, read-only (null = none chosen)
  readonly: { type: Boolean, default: false },
  findEditor: { type: Function, required: true }, // (rootElement) -> Quill | null
});

const state = shallowRef(null); // { key, blot, x, y }; shallow: a Quill blot must not be wrapped in a Vue proxy
const chip = (k) => `{{${k}}}`;

const onClick = async (e) => {
  const { blot, text, event } = e.detail ?? {};
  if (!blot) return;
  const key = text;
  // A field of the template's form ("full_name", "dob|date", "owners.name") gets its value from a submission, not from this list.
  const bound = /[a-z|.#]/.test(key ?? '');
  if (!props.readonly && key && !bound && !(key in props.placeholders)) props.placeholders[key] = '';
  state.value = { key, bound, blot, x: Math.min(event.clientX, window.innerWidth - 280), y: Math.min(event.clientY + 12, window.innerHeight - 180) };
};
const close = () => { state.value = null; };
const onDoc = (e) => { if (state.value && !e.target.closest?.('[data-chip-popover]') && !e.target.closest?.('.q-placeholder')) close(); };
const onKey = (e) => { if (e.key === 'Escape') close(); };

onMounted(() => { window.addEventListener('placeholder-clicked', onClick); document.addEventListener('mousedown', onDoc); document.addEventListener('keydown', onKey); });
onBeforeUnmount(() => { window.removeEventListener('placeholder-clicked', onClick); document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); });

// Chip -> the key's text, in place.
const toText = () => {
  const { blot, key } = state.value;
  const quill = props.findEditor(blot.scroll?.domNode);
  close();
  if (!quill) return;
  const idx = blot.index();
  quill.deleteText(idx, 1, 'user');
  quill.insertText(idx, key, 'user');
};
</script>

<template>
  <div v-if="state" data-chip-popover class="fixed z-50 w-64 rounded-card border border-line bg-surface-3 p-3 shadow-rim" :style="{ left: `${state.x}px`, top: `${state.y}px` }" role="dialog" aria-label="Placeholder value">
    <p class="font-mono text-small text-ink">{{ chip(state.key) }}</p>
    <p v-if="state.bound" class="mt-2 text-small text-ink-muted">A field of the form: it is filled in from a submission when the document is generated.</p>
    <p v-else-if="!values" class="mt-2 text-small text-ink-muted">Choose a data source in the Placeholders panel to give it a value.</p>
    <p v-else class="mt-2 rounded-control bg-sunken px-3 py-1.5 text-body" :class="values[state.key] ? 'text-ink' : 'italic text-ink-faint'">{{ values[state.key] || 'Not in this data source' }}</p>
    <div class="mt-2 flex justify-between gap-2">
      <OpButton v-if="!readonly" size="sm" variant="secondary" @click="toText">Convert to text</OpButton>
      <OpButton size="sm" @click="close">Done</OpButton>
    </div>
  </div>
</template>
