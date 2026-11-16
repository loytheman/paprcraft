<script setup>
// table-01 ("label : value"), table-02 (numbered), table-03 (three bordered columns). Each cell is
// its own Quill editor; the type and the rows are managed in DialogTable.
import { computed, inject } from 'vue';
import OpIcon from '@ds/components/OpIcon.vue';
import { TPL_KEY } from '@/helpers/template/context';
import { tableCols } from '@/helpers/template/blocks';
import TemplateQuill from './TemplateQuill.vue';

const props = defineProps({ block: { type: Object, required: true } });
const ctx = inject(TPL_KEY);

const rows = computed(() => props.block.item?.data ?? []);
const cols = computed(() => tableCols(props.block.type));
const bordered = computed(() => ['table-03', 'table-04'].includes(props.block.type));
const NAMES = { 'table-01': 'Table: label and value', 'table-02': 'Table: numbered', 'table-03': 'Table: 3 columns', 'table-04': 'Table: 4 columns' };
</script>

<template>
  <div class="tpl-stripes w-full p-1">
    <button type="button" class="mb-1 inline-flex items-center gap-1.5 text-small text-ink-faint hover:text-ink" :disabled="ctx.readonly" @click="ctx.openDialog('table', block)">
      <OpIcon name="layout" :size="14" /> {{ NAMES[block.type] ?? block.type }}
      <OpIcon v-if="!ctx.readonly" name="pencil" :size="12" />
    </button>
    <table class="w-full table-fixed border-separate" :style="{ borderSpacing: bordered ? '0' : '0 1px' }">
      <tbody>
        <tr v-for="(row, r) in rows" :key="r" class="bg-canvas/40">
          <td v-if="block.type === 'table-02'" class="w-8 py-1.5 align-top text-small text-ink-muted">{{ r + 1 }}.</td>
          <template v-for="(c, ci) in cols" :key="c">
            <td
              :class="['align-top', bordered && 'border-t border-l border-line', bordered && r === rows.length - 1 && 'border-b', bordered && ci === cols.length - 1 && 'border-r', !bordered && ci === 0 && 'w-40', bordered && 'px-1.5']"
            >
              <TemplateQuill v-if="row[c]" :model-value="row[c]" :editor-id="`${block.id}-${c}-${r}`" :block-id="block.id" />
            </td>
            <td v-if="!bordered && ci === 0" class="w-8 py-1.5 text-center align-top text-ink-muted">:</td>
          </template>
        </tr>
      </tbody>
    </table>
  </div>
</template>
