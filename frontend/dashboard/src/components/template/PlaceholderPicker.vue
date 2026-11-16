<script setup>
// Opens from the toolbar's {{x}} button: pick an existing key or type a new one, and the chip goes
// where the caret was (replacing any selected text).
import { computed, ref, watch } from 'vue';
import OpButton from '@ds/components/OpButton.vue';
import { normalizeKey } from '@/helpers/template/blocks';

const props = defineProps({
  open: { type: Boolean, default: false },
  keys: { type: Array, default: () => [] },
  selectedText: { type: String, default: '' },
  error: { type: String, default: '' },
});
const emit = defineEmits(['insert', 'close']);

const draft = ref('');
watch(() => props.open, (o) => { if (o) draft.value = normalizeKey(props.selectedText); });
const cleaned = computed(() => normalizeKey(draft.value));
const chip = (k) => `{{${k}}}`;
</script>

<template>
  <div v-if="open" class="rounded-card border border-line bg-surface-3 p-3 shadow-rim" role="dialog" aria-label="Insert a placeholder">
    <p class="text-small font-medium text-ink-muted">Insert a placeholder</p>
    <div v-if="keys.length" class="mt-2 flex flex-wrap gap-1.5">
      <button v-for="k in keys" :key="k" type="button" class="rounded-control border border-line px-2 py-1 font-mono text-small text-ink-muted hover:border-primary hover:text-ink" @mousedown.prevent @click="emit('insert', k)">{{ chip(k) }}</button>
    </div>
    <form class="mt-2 flex gap-2" @submit.prevent="cleaned && emit('insert', cleaned)">
      <input v-model="draft" placeholder="NEW_KEY" aria-label="New placeholder key" class="h-9 min-w-0 flex-1 rounded-control border border-line bg-surface-1 px-3 font-mono text-small text-ink placeholder:text-ink-faint focus:border-primary focus:outline-none" />
      <OpButton type="submit" size="sm" :disabled="!cleaned">Insert</OpButton>
      <OpButton type="button" size="sm" variant="ghost" @click="emit('close')">Close</OpButton>
    </form>
    <p v-if="error" role="alert" class="mt-2 text-small text-down">{{ error }}</p>
  </div>
</template>
