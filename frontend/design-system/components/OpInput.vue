<script setup>
// Labelled text input. `mono` for URLs, codes and other machine values.
import { useId } from 'vue';

const model = defineModel({ type: [String, Number], default: '' });
defineProps({
  label: { type: String, required: true },
  hint: { type: String, default: '' },
  error: { type: String, default: '' },
  type: { type: String, default: 'text' },
  placeholder: { type: String, default: '' },
  mono: { type: Boolean, default: false },
  required: { type: Boolean, default: false },
});
const id = useId();
</script>

<template>
  <div class="flex flex-col gap-1.5">
    <label :for="id" class="text-small font-medium text-ink-muted">{{ label }}<span v-if="required" class="text-cyan"> *</span></label>
    <input
      :id="id"
      v-model="model"
      :type="type"
      :placeholder="placeholder"
      :required="required"
      :aria-invalid="!!error"
      :aria-describedby="error || hint ? `${id}-help` : undefined"
      :class="[
        'h-10 rounded-control border bg-sunken px-3 text-body text-ink placeholder:text-ink-faint focus:border-cyan focus:outline-none',
        error ? 'border-down' : 'border-line',
        mono && 'font-mono',
      ]"
    />
    <p v-if="error || hint" :id="`${id}-help`" :class="['text-small', error ? 'text-down' : 'text-ink-faint']">{{ error || hint }}</p>
  </div>
</template>
