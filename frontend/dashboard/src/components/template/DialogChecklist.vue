<script setup>
// Edit a checklist table: title, sub heading, and the numbered questions. Each question shows one
// answer of a checklist field of the form ("{{field.optionKey}}"). "Add all questions" appends one
// row per option of a checklist field, using the option's label as the question.
//   item: { title, subtitle?, rows: [{ text, value }] }
import { computed, inject, reactive, ref } from 'vue';
import OpButton from '@ds/components/OpButton.vue';
import OpInput from '@ds/components/OpInput.vue';
import OpIcon from '@ds/components/OpIcon.vue';
import TplDialog from './TplDialog.vue';
import { TPL_KEY } from '@/helpers/template/context';
import { checklistFields, checklistRows, cleanChecklist, moveItem, singleToken, tokenText, validateFormBlock } from '@/helpers/template/blocks';

const ctx = inject(TPL_KEY);
const visible = ref(false);
const target = ref(null);
const draft = reactive({ title: '', subtitle: '', rows: [] });
const showProblems = ref(false);
const addFrom = ref('');

const fields = computed(() => checklistFields(ctx.formSchema));
const problems = computed(() => validateFormBlock({ type: 'form-checklist', item: draft }));
const optionsOf = (token) => fields.value.find((f) => f.key === String(singleToken(token) ?? '').split('.')[0])?.options ?? [];
// "field.option" currently chosen for a row, '' when none.
const choice = (row) => singleToken(row.value) ?? '';
const choose = (row, v) => { row.value = v ? tokenText(v) : ''; };
const choices = computed(() => fields.value.flatMap((f) => f.options.map((o) => ({ value: `${f.key}.${o.value}`, label: `${f.label}: ${o.label}`.slice(0, 90) }))));

const open = (block) => {
  target.value = block;
  const it = JSON.parse(JSON.stringify(block.item ?? {}));
  draft.title = it.title ?? '';
  draft.subtitle = it.subtitle ?? '';
  draft.rows = (it.rows ?? []).map((r) => ({ text: r.text ?? '', value: r.value ?? '' }));
  if (!draft.rows.length) draft.rows.push({ text: '', value: '' });
  addFrom.value = fields.value[0]?.key ?? '';
  showProblems.value = false;
  visible.value = true;
};
const addAll = () => { if (addFrom.value) draft.rows.push(...checklistRows(ctx.formSchema, addFrom.value)); };
const save = () => {
  showProblems.value = true;
  if (problems.value.length) return;
  target.value.item = { ...target.value.item, ...cleanChecklist(draft) };
  visible.value = false;
};
const selectCls = 'h-9 w-full rounded-control border border-line bg-surface-1 px-2 text-body text-ink focus:border-primary focus:outline-none';
defineExpose({ open });
</script>

<template>
  <TplDialog :open="visible" title="Checklist table" wide @close="visible = false">
    <div class="grid gap-3 sm:grid-cols-2">
      <OpInput v-model="draft.title" label="Title" hint="The grey heading row, e.g. Risk Assessment Checklist." />
      <OpInput v-model="draft.subtitle" label="Sub heading (optional)" hint="e.g. Customer Risk Assessment." />
    </div>

    <div class="mt-4 flex flex-wrap items-end gap-2 rounded-card border border-line bg-surface-2 p-3">
      <div class="min-w-48 flex-1">
        <label for="chk-from" class="text-small font-medium text-ink-muted">Add all questions from a checklist field</label>
        <select id="chk-from" v-model="addFrom" :disabled="!fields.length" :class="selectCls">
          <option v-if="!fields.length" value="">The form has no checklist field (choose a form)</option>
          <option v-for="f in fields" :key="f.key" :value="f.key">{{ f.label }} ({{ f.options.length }} questions)</option>
        </select>
      </div>
      <OpButton variant="secondary" size="sm" icon="plus" :disabled="!addFrom" @click="addAll">Add all</OpButton>
    </div>

    <ol class="mt-4 space-y-2">
      <li v-for="(r, i) in draft.rows" :key="i" class="rounded-card border border-line bg-surface-2 p-2.5">
        <div class="flex items-center justify-between gap-2">
          <p class="text-label uppercase text-ink-faint">Question {{ i + 1 }}</p>
          <div class="flex items-center gap-1">
            <OpButton variant="ghost" size="sm" :disabled="i === 0" aria-label="Move up" @click="moveItem(draft.rows, i, i - 1)"><OpIcon name="arrow-left" :size="14" class="rotate-90" /></OpButton>
            <OpButton variant="ghost" size="sm" :disabled="i === draft.rows.length - 1" aria-label="Move down" @click="moveItem(draft.rows, i, i + 1)"><OpIcon name="arrow-right" :size="14" class="rotate-90" /></OpButton>
            <OpButton variant="ghost" size="sm" aria-label="Delete question" @click="draft.rows.splice(i, 1)"><OpIcon name="trash" :size="14" /></OpButton>
          </div>
        </div>
        <textarea v-model="r.text" rows="2" :aria-label="`Question ${i + 1} text`" placeholder="The question as printed" class="mt-1 w-full rounded-control border border-line bg-surface-1 px-3 py-1.5 text-body text-ink placeholder:text-ink-faint focus:border-primary focus:outline-none" />
        <label class="mt-1.5 block text-small text-ink-muted">Shows the answer of
          <select :value="choice(r)" :class="[selectCls, 'mt-0.5']" :aria-label="`Answer for question ${i + 1}`" @change="choose(r, $event.target.value)">
            <option value="">Choose a checklist answer…</option>
            <option v-if="choice(r) && !choices.some((c) => c.value === choice(r))" :value="choice(r)">{{ choice(r) }} (not in the form)</option>
            <option v-for="c in choices" :key="c.value" :value="c.value">{{ c.label }}</option>
          </select>
        </label>
      </li>
    </ol>
    <div class="mt-3"><OpButton variant="secondary" size="sm" icon="plus" @click="draft.rows.push({ text: '', value: '' })">Add question</OpButton></div>

    <ul v-if="showProblems && problems.length" role="alert" class="status-down mt-4 list-disc rounded-control border py-2 pr-3 pl-7 text-small">
      <li v-for="p in problems.slice(0, 8)" :key="p">{{ p }}</li>
      <li v-if="problems.length > 8">…and {{ problems.length - 8 }} more.</li>
    </ul>

    <template #footer>
      <OpButton variant="secondary" @click="visible = false">Cancel</OpButton>
      <OpButton @click="save">Save</OpButton>
    </template>
  </TplDialog>
</template>
