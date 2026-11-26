<script setup>
// Table type (01 label : value, 02 numbered, 03 three columns), its rows, and the optional
// layout options JSON. The cell text itself is edited in the table.
import { computed, inject, ref } from 'vue';
import OpButton from '@ds/components/OpButton.vue';
import OpIcon from '@ds/components/OpIcon.vue';
import TplDialog from './TplDialog.vue';
import { TPL_KEY } from '@/helpers/template/context';
import { emptyRow, ensureTableCols, formGroups } from '@/helpers/template/blocks';

const TYPES = [
  { value: 'table-01', label: 'Type 01: label and value' },
  { value: 'table-02', label: 'Type 02: numbered label and value' },
  { value: 'table-03', label: 'Type 03: three bordered columns' },
];

const ctx = inject(TPL_KEY, null);
const groups = computed(() => formGroups(ctx?.formSchema));
const repeatGroup = ref('');
const visible = ref(false);
const target = ref(null);
const type = ref('table-01');
const rows = ref([]); // the block's own row objects, plus new ones
const useOptions = ref(false);
const options = ref('');
const optionsError = ref('');

const types = computed(() => (type.value === 'table-04' ? [...TYPES, { value: 'table-04', label: 'Type 04: four bordered columns (older templates)' }] : TYPES));
const preview = (row) => String(row.col1?.text ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() || '(empty)';

const open = (block) => {
  target.value = block;
  type.value = block.type;
  rows.value = [...(block.item?.data ?? [])];
  repeatGroup.value = block.item?.repeatGroup ?? '';
  options.value = block.item?.options ?? '';
  useOptions.value = !!options.value;
  optionsError.value = '';
  visible.value = true;
};

const save = () => {
  let opts = '';
  if (useOptions.value && options.value.trim()) {
    try { JSON.parse(options.value); opts = options.value; } catch { optionsError.value = 'The options are not valid JSON.'; return; }
  }
  const data = ensureTableCols(rows.value.length ? rows.value : [emptyRow(type.value)], type.value);
  target.value.type = type.value;
  target.value.item = { ...target.value.item, data, ...(opts && { options: opts }), ...(repeatGroup.value && { repeatGroup: repeatGroup.value }) };
  if (!opts) delete target.value.item.options;
  if (!repeatGroup.value) delete target.value.item.repeatGroup;
  visible.value = false;
};

defineExpose({ open });
</script>

<template>
  <TplDialog :open="visible" title="Table" @close="visible = false">
    <fieldset class="space-y-1.5">
      <legend class="mb-1 text-small font-medium text-ink-muted">Type</legend>
      <label v-for="t in types" :key="t.value" class="flex cursor-pointer items-center gap-2 text-body text-ink-muted">
        <input v-model="type" type="radio" :value="t.value" class="accent-primary" /> {{ t.label }}
      </label>
    </fieldset>

    <div class="mt-5">
      <div class="mb-2 flex items-center justify-between">
        <p class="text-small font-medium text-ink-muted">Rows ({{ rows.length }})</p>
        <OpButton variant="secondary" size="sm" icon="plus" @click="rows.push(emptyRow(type))">Add row</OpButton>
      </div>
      <ul class="divide-y divide-line-faint rounded-control border border-line">
        <li v-for="(row, i) in rows" :key="i" class="flex items-center justify-between gap-2 px-3 py-1.5">
          <span class="min-w-0 truncate text-body text-ink-muted">{{ i + 1 }}. {{ preview(row) }}</span>
          <button type="button" class="text-ink-faint hover:text-down disabled:opacity-40" :disabled="rows.length <= 1" aria-label="Remove row" @click="rows.splice(i, 1)"><OpIcon name="trash" :size="14" /></button>
        </li>
      </ul>
    </div>

    <div class="mt-5">
      <label class="text-small font-medium text-ink-muted" for="tbl-repeat">Repeat the first row for each row of</label>
      <select id="tbl-repeat" v-model="repeatGroup" class="mt-1 h-10 w-full rounded-control border border-line bg-surface-1 px-3 text-body text-ink focus:border-primary focus:outline-none">
        <option value="">Don't repeat</option>
        <option v-if="repeatGroup && !groups.some((g) => g.key === repeatGroup)" :value="repeatGroup">{{ repeatGroup }} (not in the form)</option>
        <option v-for="g in groups" :key="g.key" :value="g.key">{{ g.label || g.key }}</option>
      </select>
      <p class="mt-1 text-small text-ink-faint">{{ groups.length ? 'Put chips like owners.name in that first row. The other rows stay as they are.' : 'Pick a form with a repeating group first.' }}</p>
    </div>

    <div v-if="type !== 'table-02'" class="mt-5">
      <label class="flex cursor-pointer items-center gap-2 text-body text-ink-muted"><input v-model="useOptions" type="checkbox" class="accent-primary" /> Layout options (JSON)</label>
      <template v-if="useOptions">
        <textarea v-model="options" rows="6" spellcheck="false" class="mt-2 w-full rounded-control border border-line bg-surface-1 p-2 font-mono text-small text-ink focus:border-primary focus:outline-none" placeholder='{ "colspan1": 6, "colspan2": 2, "hideSeparator": true, "border": true }' />
        <p v-if="optionsError" class="text-small text-down">{{ optionsError }}</p>
      </template>
    </div>

    <template #footer>
      <OpButton variant="secondary" @click="visible = false">Cancel</OpButton>
      <OpButton @click="save">Save</OpButton>
    </template>
  </TplDialog>
</template>
