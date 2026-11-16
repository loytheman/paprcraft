<script setup>
// Modal confirmation on the native <dialog>, which supplies the focus trap, Esc and focus return.
// Cancel takes the initial focus so a stray Enter can't confirm a destructive action.
// tone: destructive (red, for deletes) | primary (mint, for a next step such as upgrading).
import { ref, watchPostEffect } from 'vue';
import OpButton from './OpButton.vue';
import OpIcon from './OpIcon.vue';

const props = defineProps({
  open: { type: Boolean, default: false },
  title: { type: String, required: true },
  message: { type: String, default: '' },
  confirmLabel: { type: String, default: 'Delete' },
  cancelLabel: { type: String, default: 'Cancel' },
  icon: { type: String, default: 'trash' },
  tone: { type: String, default: 'destructive' },
  // e.g. until a typed confirmation matches
  confirmDisabled: { type: Boolean, default: false },
});
const emit = defineEmits(['confirm', 'cancel']);

const dialog = ref(null);

watchPostEffect(() => {
  const el = dialog.value;
  if (!el) return;
  if (props.open && !el.open) el.showModal();
  else if (!props.open && el.open) el.close();
});
</script>

<template>
  <!-- m-auto: Tailwind's reset removes the margin that centres a <dialog>. Keep display classes on
       the inner div, since one on the <dialog> would show it while closed. -->
  <dialog
    ref="dialog"
    aria-labelledby="op-confirm-title"
    aria-describedby="op-confirm-message"
    class="m-auto w-[calc(100%-2rem)] max-w-md rounded-sheet border border-line-strong bg-surface-1 p-0 text-ink shadow-modal transition-opacity duration-150 backdrop:bg-ink/40 starting:open:opacity-0 motion-reduce:transition-none"
    @cancel.prevent="emit('cancel')"
    @click.self="emit('cancel')"
  >
    <div class="flex gap-4 p-5">
      <span :class="['flex size-10 shrink-0 items-center justify-center rounded-control border', tone === 'primary' ? 'border-primary-edge bg-primary-soft text-primary-text' : 'status-down']">
        <OpIcon :name="icon" :size="18" />
      </span>
      <div class="min-w-0">
        <h2 id="op-confirm-title" class="text-h3 wrap-break-word text-ink">{{ title }}</h2>
        <p v-if="message" id="op-confirm-message" class="mt-1.5 text-body text-ink-muted">{{ message }}</p>
        <!-- Optional richer content under the message (e.g. the amount a plan switch charges). -->
        <slot />
      </div>
    </div>
    <div class="flex flex-col-reverse gap-2 border-t border-line-soft px-5 py-4 sm:flex-row sm:justify-end">
      <!-- No cancelLabel: a single-button notice (e.g. "Done"), which then takes the focus. -->
      <OpButton v-if="cancelLabel" variant="secondary" autofocus @click="emit('cancel')">{{ cancelLabel }}</OpButton>
      <OpButton :variant="tone === 'primary' ? 'primary' : 'destructive'" :autofocus="!cancelLabel" :disabled="confirmDisabled" @click="emit('confirm')">{{ confirmLabel }}</OpButton>
    </div>
  </dialog>
</template>
