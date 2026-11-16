<script setup>
// Click a chip in the text: edit that key's value, or turn the chip back into plain text. Opens
// where the chip is (the editor dispatches `placeholder-clicked` on window).
import { nextTick, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue';
import OpButton from '@ds/components/OpButton.vue';

const props = defineProps({
  placeholders: { type: Object, required: true },
  readonly: { type: Boolean, default: false },
  findEditor: { type: Function, required: true }, // (rootElement) -> Quill | null
});

const state = shallowRef(null); // { key, blot, x, y }; shallow: a Quill blot must not be wrapped in a Vue proxy
const input = ref(null);
const chip = (k) => `{{${k}}}`;

const onClick = async (e) => {
  const { blot, text, event } = e.detail ?? {};
  if (!blot) return;
  const key = text;
  // A field of the template's form ("full_name", "dob|date", "owners.name") gets its value from a submission, not from this list.
  const bound = /[a-z|.#]/.test(key ?? '');
  if (!props.readonly && key && !bound && !(key in props.placeholders)) props.placeholders[key] = '';
  state.value = { key, bound, blot, x: Math.min(event.clientX, window.innerWidth - 280), y: Math.min(event.clientY + 12, window.innerHeight - 180) };
  await nextTick();
  input.value?.focus();
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
    <input
      v-else
      ref="input"
      v-model="placeholders[state.key]"
      :readonly="readonly"
      placeholder="Value"
      aria-label="Value"
      class="mt-2 h-9 w-full rounded-control border border-line bg-sunken px-3 text-body text-ink placeholder:text-ink-faint focus:border-cyan focus:outline-none"
      @keydown.enter.prevent="close"
    />
    <div class="mt-2 flex justify-between gap-2">
      <OpButton v-if="!readonly" size="sm" variant="secondary" @click="toText">Convert to text</OpButton>
      <OpButton size="sm" @click="close">Done</OpButton>
    </div>
  </div>
</template>
