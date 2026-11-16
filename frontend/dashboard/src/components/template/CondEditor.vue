<script setup>
// Edits a condition (the forms' visibleIf shape) as rows: "<field> <operator> <value>", combined with
// all / any when there is more than one. Used by the `if` block. v-model is the condition object;
// `fields` is [{ key, label, type, options?, row? }] (row = a field of the repeating group's row).
import { computed } from 'vue';
import OpButton from '@ds/components/OpButton.vue';
import OpIcon from '@ds/components/OpIcon.vue';
import { condToRows, rowsToCond, OPERATORS, NO_VALUE_OPS, listToText, textToList } from '@/helpers/template/blocks';

const props = defineProps({
  modelValue: { type: Object, default: null },
  fields: { type: Array, default: () => [] },
  readonly: { type: Boolean, default: false },
});
const emit = defineEmits(['update:modelValue']);

const state = computed(() => condToRows(props.modelValue));
const commit = (mode, rows) => emit('update:modelValue', rowsToCond(mode, rows));
const field = (key) => props.fields.find((f) => f.key === key);
const optionsOf = (key) => field(key)?.options ?? null;
const isYesNo = (key) => field(key)?.type === 'yesno';

const setRow = (i, patch) => commit(state.value.mode, state.value.rows.map((r, n) => (n === i ? { ...r, ...patch } : r)));
const setMode = (mode) => commit(mode, state.value.rows);
const addRow = () => commit(state.value.mode, [...state.value.rows, { key: props.fields[0]?.key ?? '', op: 'notEmpty' }]);
const removeRow = (i) => commit(state.value.mode, state.value.rows.filter((_, n) => n !== i));
const onKey = (i, key) => setRow(i, { key, value: undefined, ...(isYesNo(key) ? { op: 'eq', value: true } : {}) });
const onOp = (i, op) => setRow(i, { op, value: op === 'in' ? [] : NO_VALUE_OPS.includes(op) ? undefined : state.value.rows[i].value });
const yesNoValue = (v) => (v === true || v === 'true' ? 'true' : 'false');
const cls = 'h-8 rounded-control border border-line bg-sunken px-2 text-small text-ink focus:border-cyan focus:outline-none disabled:opacity-60';
</script>

<template>
  <div class="space-y-1.5">
    <p v-if="state.complex" class="text-small text-ink-muted">This condition has nested groups. It is kept as it is; the editor can't change it.</p>
    <template v-else>
      <div v-if="state.rows.length > 1" class="flex items-center gap-1.5 text-small text-ink-muted">
        Show when
        <select :value="state.mode" :disabled="readonly" :class="cls" aria-label="All or any" @change="setMode($event.target.value)">
          <option value="all">all</option>
          <option value="any">any</option>
        </select>
        of these are true:
      </div>
      <div v-for="(r, i) in state.rows" :key="i" class="flex flex-wrap items-center gap-1.5">
        <select :value="r.key" :disabled="readonly" :class="[cls, 'max-w-48']" aria-label="Field" @change="onKey(i, $event.target.value)">
          <option value="" disabled>Choose a field</option>
          <option v-if="r.key && !field(r.key)" :value="r.key">{{ r.key }} (not in the form)</option>
          <option v-for="f in fields" :key="f.key" :value="f.key">{{ f.label || f.key }}{{ f.row ? ' (row)' : '' }}</option>
        </select>
        <select :value="r.op" :disabled="readonly" :class="cls" aria-label="Operator" @change="onOp(i, $event.target.value)">
          <option v-for="o in OPERATORS" :key="o.value" :value="o.value">{{ o.label }}</option>
        </select>
        <template v-if="!NO_VALUE_OPS.includes(r.op)">
          <select v-if="isYesNo(r.key) && r.op !== 'in'" :value="yesNoValue(r.value)" :disabled="readonly" :class="cls" aria-label="Value" @change="setRow(i, { value: $event.target.value === 'true' })">
            <option value="true">yes</option>
            <option value="false">no</option>
          </select>
          <select v-else-if="optionsOf(r.key) && r.op !== 'in'" :value="r.value ?? ''" :disabled="readonly" :class="cls" aria-label="Value" @change="setRow(i, { value: $event.target.value })">
            <option value="" disabled>Choose</option>
            <option v-for="o in optionsOf(r.key)" :key="o.value" :value="o.value">{{ o.label }}</option>
          </select>
          <input v-else-if="r.op === 'in'" :value="listToText(r.value)" :readonly="readonly" :class="[cls, 'w-44']" placeholder="a, b, c" aria-label="Values, separated by commas" @change="setRow(i, { value: textToList($event.target.value) })" />
          <input v-else :value="r.value ?? ''" :readonly="readonly" :type="['gt', 'lt'].includes(r.op) ? 'number' : 'text'" :class="[cls, 'w-36']" placeholder="Value" aria-label="Value" @change="setRow(i, { value: $event.target.value })" />
        </template>
        <button v-if="!readonly && state.rows.length > 1" type="button" class="p-1 text-ink-faint hover:text-down" aria-label="Remove this condition" @click="removeRow(i)"><OpIcon name="trash" :size="13" /></button>
      </div>
      <OpButton v-if="!readonly" size="sm" variant="ghost" icon="plus" @click="addRow">Add a condition</OpButton>
    </template>
  </div>
</template>
