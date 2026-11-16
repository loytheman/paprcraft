<script setup>
// Edit a section table: title, rows, and per row its cells (label + value with "Insert field"), cell
// width, "numbered list", "stack all cells in one box" and "repeat this row for each row of a group".
//   item: { title, rows: [{ repeat?, stack?, cells: [{ label?, value, list?, col?, head? }] }] }   head: a small grey column title (value only)
import { computed, inject, reactive, ref } from 'vue';
import OpButton from '@ds/components/OpButton.vue';
import OpInput from '@ds/components/OpInput.vue';
import OpIcon from '@ds/components/OpIcon.vue';
import TplDialog from './TplDialog.vue';
import TokenInput from './TokenInput.vue';
import { TPL_KEY } from '@/helpers/template/context';
import { MAX_CELLS, addCell, addRow, cellWidths, cleanFormTable, formGroups, moveItem, removeCell, toggleHead, tokenIsArray, validateFormBlock } from '@/helpers/template/blocks';

const ctx = inject(TPL_KEY);
const visible = ref(false);
const target = ref(null);
const draft = reactive({ title: '', rows: [] });
const showProblems = ref(false);

const groups = computed(() => formGroups(ctx.formSchema));
const problems = computed(() => validateFormBlock({ type: 'form-table', item: draft }, ctx.formSchema));
// The repeating group whose row fields the picker may offer for this row: its own, or the one the block sits in.
const groupFor = (row) => row.repeat || ctx.groupAt?.(target.value?.id) || '';

const open = (block) => {
  target.value = block;
  const it = JSON.parse(JSON.stringify(block.item ?? {}));
  draft.title = it.title ?? '';
  draft.rows = (it.rows ?? []).map((r) => ({ repeat: r.repeat ?? '', stack: !!r.stack, cells: (r.cells ?? []).map((c) => ({ label: c.label ?? '', value: c.value ?? '', list: !!c.list, col: c.col ?? 0, head: !!c.head })) }));
  if (!draft.rows.length) addRow(draft.rows, 2);
  showProblems.value = false;
  visible.value = true;
};

const save = () => {
  showProblems.value = true;
  if (problems.value.length) return;
  const clean = cleanFormTable({ title: draft.title, rows: draft.rows.map((r) => ({ ...r, cells: r.cells.map((c) => ({ ...c, col: c.col || undefined })) })) });
  target.value.item = { ...target.value.item, ...clean };
  visible.value = false;
};

const widthOptions = [0, ...Array.from({ length: 12 }, (_, i) => i + 1)];
const selectCls = 'h-9 w-full rounded-control border border-line bg-surface-1 px-2 text-body text-ink focus:border-primary focus:outline-none';
defineExpose({ open });
</script>

<template>
  <TplDialog :open="visible" title="Section table" wide @close="visible = false">
    <OpInput v-model="draft.title" label="Title" hint="The grey heading row of the table, e.g. Customer information." />

    <div class="mt-4 space-y-3">
      <section v-for="(row, i) in draft.rows" :key="i" class="rounded-card border border-line bg-surface-2 p-3" :aria-label="`Row ${i + 1}`">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <p class="text-label uppercase text-ink-faint">Row {{ i + 1 }}</p>
          <div class="flex flex-wrap items-center gap-1">
            <OpButton variant="ghost" size="sm" :disabled="i === 0" aria-label="Move row up" @click="moveItem(draft.rows, i, i - 1)"><OpIcon name="arrow-left" :size="14" class="rotate-90" /></OpButton>
            <OpButton variant="ghost" size="sm" :disabled="i === draft.rows.length - 1" aria-label="Move row down" @click="moveItem(draft.rows, i, i + 1)"><OpIcon name="arrow-right" :size="14" class="rotate-90" /></OpButton>
            <OpButton variant="ghost" size="sm" aria-label="Delete row" @click="draft.rows.splice(i, 1)"><OpIcon name="trash" :size="14" /></OpButton>
          </div>
        </div>

        <div class="mt-2 flex flex-wrap items-center gap-x-5 gap-y-2 text-small text-ink-muted">
          <label class="flex items-center gap-2"><input v-model="row.stack" type="checkbox" class="accent-primary" /> Stack the cells in one box</label>
          <label class="flex items-center gap-2">Repeat for each row of
            <select v-model="row.repeat" :class="[selectCls, '!w-auto min-w-40']" aria-label="Repeat this row for each row of">
              <option value="">(no, show once)</option>
              <option v-if="row.repeat && !groups.some((g) => g.key === row.repeat)" :value="row.repeat">{{ row.repeat }} (not in the form)</option>
              <option v-for="g in groups" :key="g.key" :value="g.key">{{ g.label || g.key }}</option>
            </select>
          </label>
        </div>

        <div class="mt-3 grid gap-3" :class="row.cells.length > 1 ? 'md:grid-cols-2' : ''">
          <div v-for="(c, j) in row.cells" :key="j" class="rounded-control border border-line-soft p-2.5">
            <div class="mb-1.5 flex items-center justify-between">
              <p class="text-small text-ink-faint">Cell {{ j + 1 }}</p>
              <button v-if="row.cells.length > 1" type="button" class="text-ink-faint hover:text-down" :aria-label="`Remove cell ${j + 1}`" @click="removeCell(row, j)"><OpIcon name="x" :size="14" /></button>
            </div>
            <TokenInput v-if="!c.head" v-model="c.label" label="Label" hide-picker compact placeholder="e.g. Full name" />
            <div :class="!c.head && 'mt-2'"><TokenInput v-model="c.value" :label="c.head ? 'Column title' : 'Value'" compact :schema="ctx.formSchema" :repeat-group="groupFor(row)" :placeholder="c.head ? 'e.g. Name' : '{{field}}'" /></div>
            <div class="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-small text-ink-muted">
              <label class="flex items-center gap-2" title="A small grey heading: text only, no label, can be left empty"><input :checked="c.head" type="checkbox" class="accent-primary" @change="toggleHead(c, $event.target.checked)" /> Column title</label>
              <label v-if="!c.head && (c.list || tokenIsArray(ctx.formSchema, c.value))" class="flex items-center gap-2"><input v-model="c.list" type="checkbox" class="accent-primary" /> Numbered list</label>
              <label v-if="!row.stack" class="flex items-center gap-2">Width
                <select v-model.number="c.col" class="h-8 rounded-control border border-line bg-surface-1 px-1.5 text-small text-ink focus:border-primary focus:outline-none" aria-label="Cell width">
                  <option v-for="n in widthOptions" :key="n" :value="n">{{ n ? `${n}/12` : 'Auto' }}</option>
                </select>
              </label>
            </div>
          </div>
        </div>
        <div class="mt-2"><OpButton variant="ghost" size="sm" icon="plus" :disabled="row.cells.length >= MAX_CELLS" @click="addCell(row)">Add cell</OpButton> <span v-if="!row.stack" class="ml-2 text-small text-ink-faint">Cells share the width: {{ cellWidths({ cells: row.cells.map((c) => ({ ...c, col: c.col || 0 })) }).join(' + ') }} of 12</span></div>
      </section>
    </div>

    <div class="mt-3"><OpButton variant="secondary" size="sm" icon="plus" @click="addRow(draft.rows, 2)">Add row</OpButton></div>

    <ul v-if="showProblems && problems.length" role="alert" class="status-down mt-4 list-disc rounded-control border py-2 pr-3 pl-7 text-small">
      <li v-for="p in problems" :key="p">{{ p }}</li>
    </ul>

    <template #footer>
      <OpButton variant="secondary" @click="visible = false">Cancel</OpButton>
      <OpButton @click="save">Save</OpButton>
    </template>
  </TplDialog>
</template>
