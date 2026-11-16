<script setup>
// "Insert field": the fields of the template's form (the data source), grouped by section, with the
// formatter ("pipe") to write the value with. Opens from the toolbar; inserting adds a chip at the
// caret, like the {{x}} picker does for manual placeholders. Fields of a repeating group are listed
// only where that group repeats (inside a Repeat block, or a table that repeats its first row).
import { computed, ref, watch } from 'vue';
import OpButton from '@ds/components/OpButton.vue';
import { PIPES, pickerEntries, builtinEntries, chipText } from '@/helpers/template/blocks';

const props = defineProps({
  open: { type: Boolean, default: false },
  schema: { type: Object, default: null },
  repeatGroup: { type: String, default: '' },
  error: { type: String, default: '' },
});
const emit = defineEmits(['insert', 'close']);

// The form's fields, then the values the document itself provides (submission reference, date...).
const entries = computed(() => [...pickerEntries(props.schema, props.repeatGroup), ...builtinEntries()]);
const hasGroups = computed(() => (props.schema?.sections ?? []).some((s) => (s.fields ?? []).some((f) => f.type === 'group')));
// An override of the default formatter, per field: { text: pipe }. 'default' = use the field's own default.
const chosen = ref({});
watch(() => props.open, (o) => { if (o) chosen.value = {}; });
const pipeOf = (item) => (item.text in chosen.value ? chosen.value[item.text] : item.pipe);
const insert = (item) => emit('insert', chipText(item.text, pipeOf(item)));
const NAMES = { yesno: 'yes / no', date: 'date', upper: 'UPPER', lower: 'lower', list: 'list', country: 'country' };
</script>

<template>
  <div v-if="open" class="max-h-96 overflow-auto rounded-card border border-line bg-surface-3 p-3 shadow-rim" role="dialog" aria-label="Insert a field">
    <div class="flex items-center justify-between gap-2">
      <p class="text-small font-medium text-ink-muted">Insert a field from the form</p>
      <OpButton size="sm" variant="ghost" @click="emit('close')">Close</OpButton>
    </div>
    <p v-if="!schema" class="mt-2 text-small text-ink-faint">Choose a data source above to insert the form's fields. The document info values below always work.</p>
    <p v-else-if="entries.length <= 1" class="mt-2 text-small text-ink-faint">This form has no fields you can insert here.</p>
    <div v-for="s in entries" :key="s.section" class="mt-3">
      <p class="font-mono text-label uppercase text-ink-faint">{{ s.section }}</p>
      <ul class="mt-1 space-y-1">
        <li v-for="item in s.items" :key="item.text" class="flex items-center gap-2">
          <button type="button" class="min-w-0 flex-1 truncate rounded-control border border-line px-2 py-1 text-left text-small text-ink-muted hover:border-cyan hover:text-ink" :title="`{{${chipText(item.text, pipeOf(item))}}}`" @mousedown.prevent @click="insert(item)">
            {{ item.label }} <span class="ml-1 font-mono text-ink-faint">{{ item.text }}</span>
          </button>
          <select
            :value="pipeOf(item)"
            class="h-7 rounded-control border border-line bg-sunken px-1 text-small text-ink-muted focus:border-cyan focus:outline-none"
            :aria-label="`Format for ${item.label}`"
            @change="chosen = { ...chosen, [item.text]: $event.target.value }"
          >
            <option value="">as is</option>
            <option v-for="p in PIPES" :key="p" :value="p">{{ NAMES[p] }}</option>
          </select>
        </li>
      </ul>
    </div>
    <p v-if="hasGroups && !repeatGroup" class="mt-3 text-small text-ink-faint">Fields of a repeating group appear when the caret is inside a Repeat block for that group.</p>
    <p v-if="error" role="alert" class="mt-2 text-small text-down">{{ error }}</p>
  </div>
</template>
