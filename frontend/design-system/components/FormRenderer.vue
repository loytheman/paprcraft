<script setup>
// Renders a dynamic form from its schema (lib/forms.js documents the schema) and edits its values.
//   schema        { sections: [...] }
//   v-model       the values { key: value }; blank answers are removed from it
//   errors        the API's list [{ key, message, row?, field? }]
//   readonly      show the answers as text
//   audience      "account" (internal fields shown, marked) | "public" (a customer: internal fields hidden)
//   attachments   [{ id?, key?, name, size?, fieldKey }] of all file fields (v-model:attachments)
//   uploader      async (file, fieldKey) => { key, name }: uploads the file, returns its temporary key
//   consentText   what the signature checkbox says
// Sections, fields and group-row fields follow their `visibleIf` live; the server drops the answers of
// hidden fields when it saves. scrollToFirstError() focuses the first field with an error.
import { computed, nextTick, ref } from 'vue';
import FormField from './FormField.vue';
import { evalCond } from '../lib/forms.js';
import { errorFor, rowErrorsFor, withValue } from '../lib/forms-ui.js';

const props = defineProps({
  schema: { type: Object, required: true },
  modelValue: { type: Object, default: () => ({}) },
  errors: { type: Array, default: () => [] },
  readonly: { type: Boolean, default: false },
  audience: { type: String, default: 'account' },
  attachments: { type: Array, default: () => [] },
  uploader: { type: Function, default: null },
  consentText: { type: String, default: '' },
});
const emit = defineEmits(['update:modelValue', 'update:attachments']);

const root = ref(null);
const values = computed(() => props.modelValue ?? {});
const sections = computed(() =>
  (props.schema?.sections ?? [])
    .filter((s) => evalCond(s.visibleIf, values.value))
    .map((s) => ({ ...s, fields: (s.fields ?? []).filter((f) => evalCond(f.visibleIf, values.value) && !(props.audience === 'public' && f.internal)) }))
    .filter((s) => s.fields.length)
);

const setValue = (key, v) => emit('update:modelValue', withValue(values.value, key, v));
const filesOf = (key) => props.attachments.filter((a) => a.fieldKey === key);
const setFiles = (key, list) => emit('update:attachments', [...props.attachments.filter((a) => a.fieldKey !== key), ...list]);

const scrollToFirstError = async () => {
  await nextTick();
  const el = root.value?.querySelector('[data-error="true"], [aria-invalid="true"]');
  if (!el) return;
  el.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
  (el.matches?.('input,select,textarea,button') ? el : el.querySelector?.('input,select,textarea,button'))?.focus?.({ preventScroll: true });
};
defineExpose({ scrollToFirstError });
</script>

<template>
  <div ref="root" class="flex flex-col gap-8">
    <section v-for="s in sections" :key="s.id" :aria-labelledby="`sec-${s.id}`" class="flex flex-col gap-4">
      <div>
        <h2 :id="`sec-${s.id}`" class="text-h3 text-ink">{{ s.title }}</h2>
        <p v-if="s.description" class="mt-1 text-body text-ink-muted">{{ s.description }}</p>
      </div>
      <div class="grid gap-4 sm:grid-cols-2">
        <div v-for="f in s.fields" :key="f.id" :class="['min-w-0', ['longtext', 'multiselect', 'checklist', 'file', 'signature', 'group'].includes(f.type) && 'sm:col-span-2']">
          <span v-if="f.internal && audience !== 'public'" class="mb-1 inline-block rounded-full border border-line px-2 py-px font-mono text-label uppercase text-ink-faint">Internal</span>
          <FormField
            :field="f"
            :model-value="values[f.key]"
            :error="errorFor(errors, f.key)"
            :row-errors="rowErrorsFor(errors, f.key)"
            :readonly="readonly"
            :audience="audience"
            :files="filesOf(f.key)"
            :uploader="uploader"
            :consent-text="consentText"
            @update:model-value="(v) => setValue(f.key, v)"
            @update:files="(list) => setFiles(f.key, list)"
          />
        </div>
      </div>
    </section>
  </div>
</template>
