<script setup>
// Section table, drawn roughly as it prints: a grey title row, then rows of cells with a small label
// above the value. {{tokens}} show as pills. Click to edit (DialogFormTable).
//   item: { title, rows: [{ repeat?, stack?, cells: [{ label?, value, list?, col?, head? }] }] }   head: a small grey column title
import { computed, inject } from 'vue';
import OpIcon from '@ds/components/OpIcon.vue';
import { TPL_KEY } from '@/helpers/template/context';
import { cellWidths, validateFormBlock } from '@/helpers/template/blocks';
import TokenText from './TokenText.vue';

const props = defineProps({ block: { type: Object, required: true } });
const ctx = inject(TPL_KEY);
const rows = computed(() => props.block.item?.rows ?? []);
const problems = computed(() => validateFormBlock(props.block, ctx.formSchema));
const open = () => { if (!ctx.readonly) ctx.openDialog('formTable', props.block); };
</script>

<template>
  <div class="w-full" :class="!ctx.readonly && 'cursor-pointer'" @click="open">
    <div class="mb-1 flex items-center gap-1.5 text-small text-ink-faint">
      <OpIcon name="layout" :size="14" /> Section table
      <OpIcon v-if="!ctx.readonly" name="pencil" :size="12" />
      <span v-if="problems.length" class="ml-1 text-warn" :title="problems.join('\n')">needs attention ({{ problems.length }})</span>
    </div>
    <div class="overflow-hidden rounded-control border border-line-strong text-body">
      <div class="border-b border-line-strong bg-ink/8 px-3 py-1.5 font-medium text-ink">{{ block.item?.title || 'Untitled' }}</div>
      <div v-for="(row, i) in rows" :key="i" class="border-b border-line last:border-b-0">
        <div v-if="row.repeat" class="border-b border-dashed border-tertiary/40 bg-tertiary/5 px-3 py-0.5 text-label uppercase text-tertiary">repeats for each row of {{ row.repeat }}</div>
        <div v-if="row.stack" class="px-3 py-1.5">
          <div v-for="(c, j) in row.cells" :key="j" class="mb-1 last:mb-0">
            <p v-if="c.head" class="text-small text-ink-faint"><TokenText :text="c.value" /></p>
            <template v-else>
              <p class="text-small text-ink-faint">{{ c.label || '(no label)' }}</p>
              <p class="pl-4 font-semibold text-ink"><span v-if="c.list" class="mr-1 text-ink-faint">1.</span><TokenText :text="c.value" empty="(empty)" /></p>
            </template>
          </div>
        </div>
        <div v-else class="flex">
          <div v-for="(c, j) in row.cells" :key="j" class="min-w-0 border-line px-3 py-1.5" :class="j > 0 && 'border-l'" :style="{ flex: `${cellWidths(row)[j]} 1 0` }">
            <p v-if="c.head" class="truncate text-small text-ink-faint"><TokenText :text="c.value" />&nbsp;</p>
            <template v-else>
              <p class="truncate text-small text-ink-faint">{{ c.label || ' ' }}</p>
              <p class="pl-4 font-semibold text-ink"><span v-if="c.list" class="mr-1 text-ink-faint">1.</span><TokenText :text="c.value" empty="(empty)" /></p>
            </template>
          </div>
        </div>
      </div>
      <p v-if="!rows.length" class="px-3 py-3 text-small text-ink-faint">No rows yet. Click to add some.</p>
    </div>
  </div>
</template>
