<script setup>
// Labelled multi-line text input, styled like OpInput.
import { useId } from 'vue';

const model = defineModel({ type: String, default: '' });
defineProps({
  label: { type: String, required: true },
  hint: { type: String, default: '' },
  error: { type: String, default: '' },
  placeholder: { type: String, default: '' },
  rows: { type: Number, default: 3 },
  maxlength: { type: Number, default: undefined },
});
const id = useId();
</script>

<template>
  <div class="flex flex-col gap-1.5">
    <label :for="id" class="text-small font-medium text-ink-muted">{{ label }}</label>
    <textarea
      :id="id"
      v-model="model"
      :rows="rows"
      :maxlength="maxlength"
      :placeholder="placeholder"
      :aria-invalid="!!error"
      :aria-describedby="error || hint ? `${id}-help` : undefined"
      :class="[
        'resize-y rounded-control border bg-sunken px-3 py-2 text-body text-ink placeholder:text-ink-faint focus:border-cyan focus:outline-none',
        error ? 'border-down' : 'border-line',
      ]"
    />
    <p v-if="error || hint" :id="`${id}-help`" :class="['text-small', error ? 'text-down' : 'text-ink-faint']">{{ error || hint }}</p>
  </div>
</template>
