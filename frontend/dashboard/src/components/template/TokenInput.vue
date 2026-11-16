<script setup>
// A text input (or textarea) that can hold {{key|pipe}} tokens, with an "Insert field" button that
// opens the field picker and puts the token at the caret. Used by the dialogs of the section table,
// declaration and page setup. The picker lists the form's fields (and the document info values);
// `repeatGroup` makes the rows of that group available as "group.field".
import { nextTick, ref } from 'vue';
import FieldPicker from './FieldPicker.vue';
import { insertTokenAt, tokenText } from '@/helpers/template/blocks';

const props = defineProps({
  modelValue: { type: String, default: '' },
  label: { type: String, required: true },
  schema: { type: Object, default: null },
  repeatGroup: { type: String, default: '' },
  area: { type: Boolean, default: false },
  placeholder: { type: String, default: '' },
  hint: { type: String, default: '' },
  hidePicker: { type: Boolean, default: false },
  compact: { type: Boolean, default: false }, // smaller label (inside a cell editor)
});
const emit = defineEmits(['update:modelValue']);

const el = ref(null);
const open = ref(false);
const caret = ref({ a: null, b: null });
const remember = () => { if (el.value) caret.value = { a: el.value.selectionStart, b: el.value.selectionEnd }; };

const insert = async (text) => {
  const r = insertTokenAt(props.modelValue, tokenText(text), caret.value.a, caret.value.b);
  emit('update:modelValue', r.value);
  caret.value = { a: r.caret, b: r.caret };
  open.value = false;
  await nextTick();
  if (el.value) { el.value.focus(); el.value.setSelectionRange(r.caret, r.caret); }
};
const cls = 'w-full rounded-control border border-line bg-sunken px-3 text-body text-ink placeholder:text-ink-faint focus:border-cyan focus:outline-none';
const id = `ti-${Math.random().toString(36).slice(2, 8)}`;
</script>

<template>
  <div class="relative">
    <div class="flex items-end justify-between gap-2">
      <label :for="id" :class="compact ? 'text-small text-ink-faint' : 'text-small font-medium text-ink-muted'">{{ label }}</label>
      <button v-if="!hidePicker" type="button" class="rounded-control px-1.5 text-small text-cyan hover:bg-white/4" :aria-expanded="open" @mousedown.prevent @click="remember(); open = !open">Insert field</button>
    </div>
    <textarea v-if="area" :id="id" ref="el" :value="modelValue" rows="3" :placeholder="placeholder" :class="[cls, 'py-1.5']" @input="emit('update:modelValue', $event.target.value)" @blur="remember" @keyup="remember" @click="remember" />
    <input v-else :id="id" ref="el" :value="modelValue" :placeholder="placeholder" :class="[cls, 'h-9']" @input="emit('update:modelValue', $event.target.value)" @blur="remember" @keyup="remember" @click="remember" />
    <p v-if="hint" class="mt-0.5 text-small text-ink-faint">{{ hint }}</p>
    <div v-if="open" class="absolute right-0 z-40 mt-1 w-full min-w-72 max-w-md">
      <FieldPicker :open="open" :schema="schema" :repeat-group="repeatGroup" @insert="insert" @close="open = false" />
    </div>
  </div>
</template>
