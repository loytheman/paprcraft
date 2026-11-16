<script setup>
// Labelled native select. options = [{ value, label }].
import { useId } from 'vue';

const model = defineModel({ type: [String, Number], default: '' });
defineProps({
  label: { type: String, required: true },
  options: { type: Array, required: true },
  hint: { type: String, default: '' },
  error: { type: String, default: '' },
});
const id = useId();
</script>

<template>
  <div class="flex flex-col gap-1.5">
    <label :for="id" class="text-small font-medium text-ink-muted">{{ label }}</label>
    <div class="relative">
      <select
        :id="id"
        v-model="model"
        :aria-invalid="!!error"
        :class="[
          'h-10 w-full appearance-none rounded-control border bg-surface-1 pr-9 pl-3 text-body text-ink focus:border-primary focus:shadow-ring focus:outline-none',
          error ? 'border-down-soft focus:border-down-soft focus:shadow-down' : 'border-line-strong',
        ]"
      >
        <option v-for="o in options" :key="o.value" :value="o.value" class="bg-surface-2">{{ o.label }}</option>
      </select>
      <svg class="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-ink-faint" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
    </div>
    <p v-if="error || hint" :class="['text-small', error ? 'text-down' : 'text-ink-faint']">{{ error || hint }}</p>
  </div>
</template>
