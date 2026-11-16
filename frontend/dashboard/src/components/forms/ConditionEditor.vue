<script setup>
// Edits one visibleIf: a list of rows ("<earlier field> <operator> <value>") joined by all / any.
// `sources` are the fields a row may look at (builder.js conditionSources). Emits the new condition
// (undefined when no rows are left). A condition with nested all/any (hand-made JSON) is shown
// read-only with a Clear button.
import { computed } from 'vue';
import OpButton from '@ds/components/OpButton.vue';
import { OP_LABEL, coerceConditionValue, condToRows, defaultValueFor, newCondition, opNeedsValue, opsFor, rowsToCond } from '@/helpers/forms/builder';

const props = defineProps({
  modelValue: { type: Object, default: undefined },
  sources: { type: Array, required: true },
  readonly: { type: Boolean, default: false },
  noun: { type: String, default: 'field' }, // "field" | "section", for the wording
});
const emit = defineEmits(['update:modelValue']);

const state = computed(() => condToRows(props.modelValue));
const sourceOf = (row) => props.sources.find((f) => f.key === row.key);
const ops = (row) => opsFor(sourceOf(row)?.type ?? 'text').map((o) => ({ value: o, label: OP_LABEL[o] }));
const optionsOf = (row) => sourceOf(row)?.options ?? [];

const commit = (mode, rows) => emit('update:modelValue', rowsToCond(mode, rows));
const setMode = (mode) => commit(mode, state.value.rows);
const addRow = () => {
  const src = props.sources[0];
  if (src) commit(state.value.mode, [...state.value.rows, newCondition(src)]);
};
const removeRow = (i) => commit(state.value.mode, state.value.rows.filter((_, n) => n !== i));
const patch = (i, change) => commit(state.value.mode, state.value.rows.map((r, n) => (n === i ? { ...r, ...change } : r)));

const setKey = (i, key) => {
  const src = props.sources.find((f) => f.key === key);
  const next = newCondition(src);
  patch(i, { key: next.key, op: next.op, value: next.value });
};
const setOp = (i, op) => {
  const row = state.value.rows[i];
  const src = sourceOf(row) ?? { type: 'text' };
  const { value, ...rest } = row;
  const next = { ...rest, op };
  // Keep the value when it still fits (a single value stays single, a list stays a list).
  if (opNeedsValue(op)) next.value = value !== undefined && (row.op === 'in') === (op === 'in') ? value : defaultValueFor(src, op);
  commit(state.value.mode, state.value.rows.map((r, n) => (n === i ? next : r)));
};
const setValue = (i, raw) => {
  const row = state.value.rows[i];
  patch(i, { value: coerceConditionValue(sourceOf(row), row.op, raw) });
};
const toggleIn = (i, optValue, on) => {
  const cur = Array.isArray(state.value.rows[i].value) ? state.value.rows[i].value : [];
  patch(i, { value: on ? [...cur, optValue] : cur.filter((v) => v !== optValue) });
};
const isOptionValue = (row) => row.op !== 'in' && ['select', 'multiselect'].includes(sourceOf(row)?.type) && optionsOf(row).length > 0;
const inputType = (row) => (sourceOf(row)?.type === 'number' || row.op === 'gt' || row.op === 'lt' ? 'number' : sourceOf(row)?.type === 'date' ? 'date' : 'text');
const fieldCls = 'h-9 rounded-control border border-line bg-sunken px-2 text-small text-ink focus:border-cyan focus:outline-none disabled:opacity-60';
</script>

<template>
  <div>
    <p v-if="state.complex" class="rounded-control border border-line bg-surface-2 px-3 py-2 text-small text-ink-muted">
      This condition uses nested groups, which the builder can't edit. <button type="button" class="text-cyan underline" :disabled="readonly" @click="emit('update:modelValue', undefined)">Clear it</button> to set a new one.
    </p>
    <template v-else>
      <p v-if="!state.rows.length" class="text-small text-ink-faint">Always shown.</p>
      <div v-if="state.rows.length > 1" class="mb-2 flex items-center gap-2 text-small text-ink-muted">
        Show this {{ noun }} when
        <select :value="state.mode" :disabled="readonly" :class="fieldCls" aria-label="Match all or any" @change="setMode($event.target.value)">
          <option value="all">all of these</option>
          <option value="any">any of these</option>
        </select>
        hold:
      </div>
      <p v-else-if="state.rows.length === 1" class="mb-2 text-small text-ink-muted">Show this {{ noun }} only when:</p>

      <ul class="space-y-2">
        <li v-for="(row, i) in state.rows" :key="i" class="flex flex-wrap items-start gap-2 rounded-control border border-line-soft bg-surface-2 p-2">
          <select :value="row.key" :disabled="readonly" :class="[fieldCls, 'min-w-0 flex-1', !sourceOf(row) && 'border-down']" aria-label="Field" @change="setKey(i, $event.target.value)">
            <option v-for="f in sources" :key="f.key" :value="f.key">{{ f.label }}</option>
            <option v-if="!sourceOf(row)" :value="row.key">(missing: {{ row.key }})</option>
          </select>
          <select :value="row.op" :disabled="readonly" :class="fieldCls" aria-label="Operator" @change="setOp(i, $event.target.value)">
            <option v-for="o in ops(row)" :key="o.value" :value="o.value">{{ o.label }}</option>
          </select>
          <template v-if="opNeedsValue(row.op)">
            <select v-if="sourceOf(row)?.type === 'yesno'" :value="String(row.value)" :disabled="readonly" :class="fieldCls" aria-label="Value" @change="setValue(i, $event.target.value)">
              <option value="true">Yes</option>
              <option value="false">No</option>
            </select>
            <select v-else-if="isOptionValue(row)" :value="row.value" :disabled="readonly" :class="fieldCls" aria-label="Value" @change="setValue(i, $event.target.value)">
              <option v-for="o in optionsOf(row)" :key="o.value" :value="o.value">{{ o.label }}</option>
            </select>
            <div v-else-if="row.op === 'in' && optionsOf(row).length" class="flex w-full flex-wrap gap-x-4 gap-y-1">
              <label v-for="o in optionsOf(row)" :key="o.value" class="flex items-center gap-1.5 text-small text-ink-muted">
                <input type="checkbox" class="size-4 accent-cyan" :checked="(row.value ?? []).includes(o.value)" :disabled="readonly" @change="toggleIn(i, o.value, $event.target.checked)" />
                {{ o.label }}
              </label>
            </div>
            <input
              v-else
              :type="row.op === 'in' ? 'text' : inputType(row)"
              :value="Array.isArray(row.value) ? row.value.join(', ') : row.value"
              :disabled="readonly"
              :placeholder="row.op === 'in' ? 'a, b, c' : 'value'"
              :class="[fieldCls, 'min-w-0 flex-1']"
              aria-label="Value"
              @change="setValue(i, $event.target.value)"
            />
          </template>
          <OpButton v-if="!readonly" size="sm" variant="ghost" aria-label="Remove condition" @click="removeRow(i)">✕</OpButton>
        </li>
      </ul>

      <div v-if="!readonly" class="mt-2">
        <OpButton size="sm" variant="secondary" icon="plus" :disabled="!sources.length" @click="addRow">{{ state.rows.length ? 'Add another condition' : 'Add a condition' }}</OpButton>
        <p v-if="!sources.length" class="mt-1 text-small text-ink-faint">There is no earlier field to depend on yet. Conditions can only look at fields above this one.</p>
      </div>
    </template>
  </div>
</template>
