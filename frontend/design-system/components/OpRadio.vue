<script setup>
// One radio button with its label. Use several with the same `name` and v-model: the model holds the
// `value` of the selected one.
import { useId } from 'vue';

const model = defineModel({ type: [String, Number, Boolean], default: undefined });
defineProps({
  value: { type: [String, Number, Boolean], required: true },
  label: { type: String, default: '' },
  name: { type: String, default: '' },
  disabled: { type: Boolean, default: false },
});
const id = useId();
</script>

<template>
  <label :for="id" :class="['inline-flex items-center gap-2 text-body text-ink', disabled ? 'opacity-60' : 'cursor-pointer']">
    <input :id="id" v-model="model" type="radio" :name="name || undefined" :value="value" :disabled="disabled" class="size-4 shrink-0 accent-cyan" />
    <span><slot>{{ label }}</slot></span>
  </label>
</template>
