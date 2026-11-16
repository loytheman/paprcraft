<script setup>
// The blocks of a section (or of a list, recursively). Each row has a drag handle, a menu
// (clone, move, delete) and the block itself. Reordering works inside one list; the up/down items
// in the menu do the same without dragging.
import { computed, inject, toRaw } from 'vue';
import OpIcon from '@ds/components/OpIcon.vue';
import { TPL_KEY } from '@/helpers/template/context';
import { cloneBlock, moveItem, newBlock, isContainer, TABLE_TYPES, SIGN_TYPES, TEXT_TYPES } from '@/helpers/template/blocks';
import BlockText from './BlockText.vue';
import BlockTable from './BlockTable.vue';
import BlockLayout from './BlockLayout.vue';
import BlockContainer from './BlockContainer.vue';
import BlockSign from './BlockSign.vue';
import BlockFormTable from './BlockFormTable.vue';
import BlockFormChecklist from './BlockFormChecklist.vue';
import BlockFormDeclaration from './BlockFormDeclaration.vue';
import TplMenu from './TplMenu.vue';

const props = defineProps({
  modelValue: { type: Array, required: true },
  depth: { type: Number, default: 0 }, // 0 = the section, 1+ = inside lists
});
const ctx = inject(TPL_KEY);

// "1." counting only the list items before this one in the same list.
const numberOf = (idx) => 1 + props.modelValue.slice(0, idx).filter((b) => b.type === 'list-item-paragraph').length;
const markerStyle = computed(() => ({ 1: 'decimal', 2: 'lower-roman' })[props.depth] ?? 'lower-alpha');

const menuItems = (idx) => [
  { label: 'Clone', icon: 'copy', action: () => props.modelValue.splice(idx + 1, 0, cloneBlock(props.modelValue[idx])) },
  // A repeat / if takes new blocks inside while it has the focus; this adds one after it instead.
  ...(isContainer(props.modelValue[idx]) ? [{ label: 'Add paragraph below', icon: 'plus', action: () => props.modelValue.splice(idx + 1, 0, newBlock('paragraph')) }] : []),
  { label: 'Move up', disabled: idx === 0, action: () => moveItem(props.modelValue, idx, idx - 1) },
  { label: 'Move down', disabled: idx === props.modelValue.length - 1, action: () => moveItem(props.modelValue, idx, idx + 1) },
  { label: 'Delete', icon: 'trash', action: () => props.modelValue.splice(idx, 1) },
];

// Drag and drop within one list.
const onDragStart = (e, idx) => {
  ctx.dragState = { list: toRaw(props.modelValue), from: idx };
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', 'template-block');
  const li = e.target.closest('li');
  if (li) e.dataTransfer.setDragImage(li, 8, 8);
};
// ctx is reactive, so what was stored comes back wrapped: compare the raw arrays.
const sameList = () => !!ctx.dragState && toRaw(ctx.dragState.list) === toRaw(props.modelValue);
const onDragOver = (e) => { if (sameList()) e.preventDefault(); };
const onDrop = (e, idx) => {
  if (!sameList()) return;
  e.preventDefault();
  e.stopPropagation();
  moveItem(props.modelValue, ctx.dragState.from, idx);
  ctx.dragState = null;
};
</script>

<template>
  <ul class="tpl-list" :class="depth ? 'pl-8' : ''" :data-depth="depth">
    <li
      v-for="(block, idx) in modelValue"
      :key="block.id"
      :style="block.type === 'list-item-paragraph' ? { display: 'list-item', listStyleType: markerStyle } : null"
      :value="block.type === 'list-item-paragraph' ? numberOf(idx) : undefined"
      class="relative my-0.5 rounded-control"
      :class="ctx.focusId === block.id && 'ring-1 ring-cyan/40'"
      @click.stop="ctx.setFocus(block.id)"
      @dragover="onDragOver"
      @drop="onDrop($event, idx)"
    >
      <div class="flex items-start gap-1">
        <div v-if="!ctx.readonly" class="flex w-12 shrink-0 items-center justify-end pt-1 text-ink-faint">
          <span class="cursor-grab px-0.5 hover:text-ink active:cursor-grabbing" draggable="true" title="Drag to reorder" @dragstart="onDragStart($event, idx)"><OpIcon name="menu" :size="14" /></span>
          <TplMenu :items="menuItems(idx)" title="Block actions" button-class="!px-0.5" />
        </div>
        <div class="min-w-0 flex-1">
          <BlockList v-if="block.type === 'list' && Array.isArray(block.item)" :model-value="block.item" :depth="depth + 1" />
          <BlockContainer v-else-if="isContainer(block)" :block="block" />
          <BlockText v-else-if="TEXT_TYPES.includes(block.type)" :block="block" />
          <BlockTable v-else-if="TABLE_TYPES.includes(block.type)" :block="block" />
          <BlockSign v-else-if="SIGN_TYPES.includes(block.type)" :block="block" />
          <BlockFormTable v-else-if="block.type === 'form-table'" :block="block" />
          <BlockFormChecklist v-else-if="block.type === 'form-checklist'" :block="block" />
          <BlockFormDeclaration v-else-if="block.type === 'form-declaration'" :block="block" />
          <BlockLayout v-else :block="block" />
        </div>
      </div>
    </li>
  </ul>
</template>

<style>
.tpl-list { min-height: 2rem; }
.tpl-stripes {
  border: 1px dashed rgb(250 204 21 / 0.35);
  border-radius: 6px;
  background: repeating-linear-gradient(-45deg, transparent, transparent 6px, rgb(255 255 255 / 0.025) 6px, rgb(255 255 255 / 0.025) 12px);
}
.tpl-stripes:hover { border-style: solid; }
</style>
