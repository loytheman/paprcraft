<script setup>
// A modal on the native <dialog> (focus trap, Esc, focus return), with a title, a body slot and a
// footer slot. Same look as OpConfirmDialog, but with room for forms.
import { ref, watchPostEffect } from 'vue';
import OpIcon from '@ds/components/OpIcon.vue';

const props = defineProps({
  open: { type: Boolean, default: false },
  title: { type: String, required: true },
  wide: { type: Boolean, default: false },
});
const emit = defineEmits(['close']);
const dialog = ref(null);

watchPostEffect(() => {
  const el = dialog.value;
  if (!el) return;
  if (props.open && !el.open) el.showModal();
  else if (!props.open && el.open) el.close();
});
</script>

<template>
  <dialog
    ref="dialog"
    :aria-label="title"
    :class="['m-auto max-h-[90dvh] w-[calc(100%-2rem)] overflow-visible rounded-sheet border border-line-strong bg-surface-1 p-0 text-ink shadow-modal backdrop:bg-ink/40', wide ? 'max-w-3xl' : 'max-w-lg']"
    @cancel.prevent="emit('close')"
    @click.self="emit('close')"
  >
    <div class="flex items-center justify-between gap-3 border-b border-line-soft px-5 py-3">
      <h2 class="text-h3 text-ink">{{ title }}</h2>
      <button type="button" class="text-ink-faint hover:text-ink" aria-label="Close" @click="emit('close')"><OpIcon name="x" :size="18" /></button>
    </div>
    <div class="max-h-[65dvh] overflow-y-auto px-5 py-4"><slot /></div>
    <div v-if="$slots.footer" class="flex flex-col-reverse gap-2 border-t border-line-soft px-5 py-3 sm:flex-row sm:justify-end"><slot name="footer" /></div>
  </dialog>
</template>
