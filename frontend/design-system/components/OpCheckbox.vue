<script setup>
// A checkbox with its label to the right. v-model is a Boolean. The label slot can hold longer text
// (a consent statement); `error` shows under it.
import { useId } from 'vue';

const model = defineModel({ type: Boolean, default: false });
defineProps({
  label: { type: String, default: '' },
  error: { type: String, default: '' },
  disabled: { type: Boolean, default: false },
});
const id = useId();
</script>

<template>
  <div class="flex flex-col gap-1">
    <label :for="id" :class="['flex items-start gap-2.5 text-body text-ink', disabled ? 'opacity-60' : 'cursor-pointer']">
      <input
        :id="id"
        v-model="model"
        type="checkbox"
        :disabled="disabled"
        :aria-invalid="!!error"
        class="mt-[3px] size-4 shrink-0 accent-cyan"
      />
      <span><slot>{{ label }}</slot></span>
    </label>
    <p v-if="error" class="pl-6.5 text-small text-down">{{ error }}</p>
  </div>
</template>
