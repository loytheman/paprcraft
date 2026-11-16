<script setup>
// One field of a dynamic form (see FormRenderer.vue, which lays out sections and owns the values).
// Handles every field type in lib/forms.js; a `group` renders its rows with this same component.
import { computed, ref, useId } from 'vue';
import OpInput from './OpInput.vue';
import OpTextarea from './OpTextarea.vue';
import OpSelect from './OpSelect.vue';
import OpButton from './OpButton.vue';
import OpIcon from './OpIcon.vue';
import OpCheckbox from './OpCheckbox.vue';
import OpRadio from './OpRadio.vue';
import { evalCond } from '../lib/forms.js';
import { COUNTRIES } from '../lib/countries.js';
import { FILE_ACCEPT, answerText, fileProblem, fileSize, withRowValue } from '../lib/forms-ui.js';

const props = defineProps({
  field: { type: Object, required: true },
  modelValue: { default: undefined },
  error: { type: String, default: '' },
  rowErrors: { type: Array, default: () => [] }, // group rows: [{ row, field, message }]
  readonly: { type: Boolean, default: false },
  audience: { type: String, default: 'account' },
  files: { type: Array, default: () => [] }, // this field's attachments (file fields)
  uploader: { type: Function, default: null },
  consentText: { type: String, default: '' },
});
const emit = defineEmits(['update:modelValue', 'update:files']);

const f = computed(() => props.field);
const id = useId();
const labelText = computed(() => `${f.value.label}${f.value.required ? ' *' : ''}`);
const hint = computed(() => f.value.help ?? '');
const set = (v) => emit('update:modelValue', v);

// text-like inputs: the model is the raw string (the server trims and coerces)
const text = computed({ get: () => props.modelValue ?? '', set });
const inputType = computed(() => ({ number: 'number', date: 'date', email: 'email', phone: 'tel' })[f.value.type] ?? 'text');

const selectOptions = computed(() => [{ value: '', label: 'Select…' }, ...(f.value.options ?? [])]);
const countryOptions = [{ value: '', label: 'Select a country…' }, ...COUNTRIES];

// multiselect
const picked = computed(() => props.modelValue ?? []);
const togglePick = (value, on) => set(on ? [...picked.value, value] : picked.value.filter((x) => x !== value));

// checklist: { optionValue: true|false }
const setCheck = (value, answer) => set({ ...(props.modelValue ?? {}), [value]: answer });

// signature: { name, consent }
const sig = computed(() => props.modelValue ?? { name: '', consent: false });
const setSig = (patch) => set({ ...sig.value, ...patch });

// group
const rows = computed(() => (Array.isArray(props.modelValue) ? props.modelValue : []));
const maxRows = computed(() => f.value.group?.max ?? 200);
const addRow = () => rows.value.length < maxRows.value && set([...rows.value, {}]);
const removeRow = (i) => set(rows.value.filter((_, n) => n !== i));
const setRowField = (i, key, v) => set(rows.value.map((r, n) => (n === i ? withRowValue(r, key, v) : r)));
const rowFieldVisible = (row, gf) => evalCond(gf.visibleIf, row);
const rowFieldError = (i, gf) => props.rowErrors.find((e) => e.row === i && e.field === gf.key)?.message ?? '';

// file
const fileInput = ref(null);
const uploading = ref(false);
const fileError = ref('');
const onPick = async (ev) => {
  const list = [...(ev.target.files ?? [])];
  ev.target.value = '';
  fileError.value = '';
  if (!props.uploader) return (fileError.value = 'Uploads are not available here.');
  let added = [...props.files];
  uploading.value = true;
  try {
    for (const file of list) {
      const problem = fileProblem(file, added.length);
      if (problem) { fileError.value = `${file.name}: ${problem}`; break; }
      const { key, name } = await props.uploader(file, f.value.key);
      added = [...added, { key, name: name || file.name, size: file.size, fieldKey: f.value.key }];
      emit('update:files', added);
    }
  } catch (e) {
    fileError.value = e?.message || 'The upload failed. Try again.';
  } finally {
    uploading.value = false;
  }
};
const removeFile = (a) => emit('update:files', props.files.filter((x) => x !== a));

const readonlyText = computed(() => answerText(f.value, props.modelValue));
const shownError = computed(() => props.error || fileError.value);
</script>

<template>
  <!-- readonly: the answer as text -->
  <div v-if="readonly" class="flex flex-col gap-1" :data-field="f.key">
    <span class="text-small font-medium text-ink-muted">{{ f.label }}</span>
    <template v-if="f.type === 'group'">
      <p v-if="!rows.length" class="text-body text-ink-faint">-</p>
      <div v-for="(row, i) in rows" :key="i" class="grid gap-3 rounded-card border border-line-soft bg-surface-1 p-3 sm:grid-cols-2">
        <template v-for="gf in f.group.fields" :key="gf.id">
          <FormField v-if="rowFieldVisible(row, gf)" :field="gf" :model-value="row[gf.key]" readonly />
        </template>
      </div>
    </template>
    <template v-else-if="f.type === 'file'">
      <p v-if="!files.length" class="text-body text-ink-faint">-</p>
      <ul v-else class="flex flex-col gap-0.5 text-body text-ink">
        <li v-for="a in files" :key="a.id || a.key">{{ a.name }}</li>
      </ul>
    </template>
    <p v-else class="text-body whitespace-pre-line text-ink">{{ readonlyText || '-' }}</p>
  </div>

  <!-- editable -->
  <template v-else>
    <OpInput v-if="['text', 'number', 'date', 'email', 'phone'].includes(f.type)" v-model="text" :label="f.label" :type="inputType" :required="f.required" :hint="hint" :error="shownError" :data-field="f.key" />
    <OpTextarea v-else-if="f.type === 'longtext'" v-model="text" :label="labelText" :hint="hint" :error="shownError" :rows="4" :maxlength="f.maxLength" :data-field="f.key" />
    <OpSelect v-else-if="f.type === 'select'" :model-value="modelValue ?? ''" :label="labelText" :options="selectOptions" :hint="hint" :error="shownError" :data-field="f.key" @update:model-value="set" />
    <OpSelect v-else-if="f.type === 'country'" :model-value="modelValue ?? ''" :label="labelText" :options="countryOptions" :hint="hint" :error="shownError" :data-field="f.key" @update:model-value="set" />

    <!-- choice fields share one frame -->
    <div v-else-if="['multiselect', 'yesno', 'checklist'].includes(f.type)" role="group" :aria-labelledby="`${id}-l`" :data-error="!!shownError" :data-field="f.key" class="flex flex-col gap-2">
      <span :id="`${id}-l`" class="text-small font-medium text-ink-muted">{{ labelText }}</span>
      <p v-if="hint" class="text-small text-ink-faint">{{ hint }}</p>

      <div v-if="f.type === 'multiselect'" class="flex flex-col gap-1.5">
        <OpCheckbox v-for="o in f.options" :key="o.value" :model-value="picked.includes(o.value)" :label="o.label" @update:model-value="(on) => togglePick(o.value, on)" />
      </div>

      <div v-else-if="f.type === 'yesno'" class="flex gap-5">
        <OpRadio :model-value="modelValue" :value="true" label="Yes" :name="id" @update:model-value="set(true)" />
        <OpRadio :model-value="modelValue" :value="false" label="No" :name="id" @update:model-value="set(false)" />
      </div>

      <div v-else class="flex flex-col divide-y divide-line-soft rounded-card border border-line-soft">
        <div v-for="o in f.options" :key="o.value" class="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 px-3 py-2">
          <span class="text-body text-ink">{{ o.label }}</span>
          <span class="flex gap-5">
            <OpRadio :model-value="(modelValue ?? {})[o.value]" :value="true" label="Yes" :name="`${id}-${o.value}`" @update:model-value="setCheck(o.value, true)" />
            <OpRadio :model-value="(modelValue ?? {})[o.value]" :value="false" label="No" :name="`${id}-${o.value}`" @update:model-value="setCheck(o.value, false)" />
          </span>
        </div>
      </div>
      <p v-if="shownError" class="text-small text-down">{{ shownError }}</p>
    </div>

    <!-- file -->
    <div v-else-if="f.type === 'file'" role="group" :aria-labelledby="`${id}-l`" :data-error="!!shownError" :data-field="f.key" class="flex flex-col gap-2">
      <span :id="`${id}-l`" class="text-small font-medium text-ink-muted">{{ labelText }}</span>
      <p v-if="hint" class="text-small text-ink-faint">{{ hint }}</p>
      <ul v-if="files.length" class="flex flex-col gap-1.5">
        <li v-for="a in files" :key="a.id || a.key" class="flex items-center justify-between gap-3 rounded-control border border-line-soft bg-surface-1 px-3 py-2 text-body text-ink">
          <span class="min-w-0 truncate">{{ a.name }}<span v-if="a.size" class="ml-2 text-small text-ink-faint">{{ fileSize(a.size) }}</span></span>
          <button type="button" class="text-ink-faint hover:text-down" :aria-label="`Remove ${a.name}`" @click="removeFile(a)"><OpIcon name="x" :size="16" /></button>
        </li>
      </ul>
      <div class="flex items-center gap-3">
        <input ref="fileInput" type="file" class="sr-only" :accept="FILE_ACCEPT" multiple :aria-label="`Add files for ${f.label}`" @change="onPick" />
        <OpButton type="button" variant="secondary" size="sm" icon="plus" :disabled="uploading" @click="fileInput.click()">{{ uploading ? 'Uploading…' : 'Add file' }}</OpButton>
        <span class="text-small text-ink-faint">PNG, JPEG, WebP or PDF, up to 10 MB</span>
      </div>
      <p v-if="shownError" class="text-small text-down">{{ shownError }}</p>
    </div>

    <!-- signature -->
    <div v-else-if="f.type === 'signature'" :data-error="!!shownError" :data-field="f.key" class="flex flex-col gap-3 rounded-card border border-line bg-surface-1 p-4">
      <OpInput :model-value="sig.name" :label="f.label" :required="f.required" hint="Type your full name to sign." @update:model-value="(v) => setSig({ name: v })" />
      <OpCheckbox :model-value="sig.consent === true" @update:model-value="(v) => setSig({ consent: v })">{{ consentText || 'I confirm the information I provided is accurate and complete. Typing my name here is my signature on this form.' }}</OpCheckbox>
      <p v-if="shownError" class="text-small text-down">{{ shownError }}</p>
    </div>

    <!-- group of rows -->
    <div v-else-if="f.type === 'group'" role="group" :aria-labelledby="`${id}-l`" :data-error="!!shownError" :data-field="f.key" class="flex flex-col gap-3">
      <span :id="`${id}-l`" class="text-small font-medium text-ink-muted">{{ labelText }}</span>
      <p v-if="hint" class="text-small text-ink-faint">{{ hint }}</p>
      <div v-for="(row, i) in rows" :key="i" class="flex flex-col gap-3 rounded-card border border-line bg-surface-1 p-4">
        <div class="flex items-center justify-between">
          <span class="font-mono text-label uppercase text-ink-faint">{{ f.label }} {{ i + 1 }}</span>
          <button type="button" class="inline-flex items-center gap-1 text-small text-ink-faint hover:text-down" :aria-label="`Remove ${f.label} ${i + 1}`" @click="removeRow(i)"><OpIcon name="trash" :size="14" />Remove</button>
        </div>
        <div class="grid gap-3 sm:grid-cols-2">
          <template v-for="gf in f.group.fields" :key="gf.id">
            <FormField v-if="rowFieldVisible(row, gf)" :field="gf" :model-value="row[gf.key]" :error="rowFieldError(i, gf)" :audience="audience" @update:model-value="(v) => setRowField(i, gf.key, v)" />
          </template>
        </div>
      </div>
      <div class="flex items-center gap-3">
        <OpButton type="button" variant="secondary" size="sm" icon="plus" :disabled="rows.length >= maxRows" @click="addRow">Add {{ f.label.toLowerCase() }}</OpButton>
        <span v-if="f.group?.min" class="text-small text-ink-faint">At least {{ f.group.min }}</span>
      </div>
      <p v-if="shownError" class="text-small text-down">{{ shownError }}</p>
    </div>
  </template>
</template>
