<script setup>
// A `repeat` (its blocks are written once per row of a form's repeating group) or an `if` (its blocks
// are written only when a condition holds). Both hold a nested block list, edited with the same
// BlockList as a section.   repeat: item { group, list }   if: item { cond, list }
import { computed, inject } from 'vue';
import OpIcon from '@ds/components/OpIcon.vue';
import { TPL_KEY } from '@/helpers/template/context';
import { formGroups, formFields } from '@/helpers/template/blocks';
import BlockList from './BlockList.vue';
import CondEditor from './CondEditor.vue';

const props = defineProps({ block: { type: Object, required: true } });
const ctx = inject(TPL_KEY);

const isRepeat = computed(() => props.block.type === 'repeat');
const groups = computed(() => formGroups(ctx.formSchema));
const group = computed(() => groups.value.find((g) => g.key === props.block.item.group));
// Fields the condition can look at: the repeating row's fields first (when inside a repeat), then the form's.
const condFields = computed(() => {
  const all = formFields(ctx.formSchema).filter((f) => !['group', 'file'].includes(f.type));
  const rowGroup = ctx.groupAt?.(props.block.id);
  const rows = rowGroup ? formGroups(ctx.formSchema).find((g) => g.key === rowGroup)?.fields.map((f) => ({ ...f, row: true })) ?? [] : [];
  return [...rows, ...all];
});
const cls = 'h-8 rounded-control border border-line bg-sunken px-2 text-small text-ink focus:border-cyan focus:outline-none disabled:opacity-60';
</script>

<template>
  <div class="w-full rounded-card border border-dashed border-violet/50 bg-violet/5">
    <div class="flex flex-wrap items-start gap-2 border-b border-dashed border-violet/30 px-2 py-1.5">
      <span class="mt-1 inline-flex items-center gap-1.5 font-mono text-label uppercase text-violet-soft">
        <OpIcon :name="isRepeat ? 'refresh' : 'layout'" :size="13" /> {{ isRepeat ? 'Repeat for each row of' : 'Only if' }}
      </span>
      <template v-if="isRepeat">
        <select v-model="block.item.group" :disabled="ctx.readonly" :class="cls" aria-label="Repeating group">
          <option value="" disabled>Choose a group</option>
          <option v-if="block.item.group && !group" :value="block.item.group">{{ block.item.group }} (not in the form)</option>
          <option v-for="g in groups" :key="g.key" :value="g.key">{{ g.label || g.key }}</option>
        </select>
        <span v-if="group" class="mt-1 text-small text-ink-faint">Use <span class="font-mono">{{ group.key }}.<em>field</em></span> and <span class="font-mono">{{ group.key }}.#</span> in the text.</span>
      </template>
      <CondEditor v-else v-model="block.item.cond" :fields="condFields" :readonly="ctx.readonly" class="min-w-0 flex-1" />
    </div>
    <div class="p-1.5" @click="ctx.setFocus(block.id)">
      <BlockList :model-value="block.item.list" :depth="0" />
      <p v-if="!block.item.list.length" class="px-2 py-3 text-center text-small text-ink-faint">Empty. Click here, then use <strong class="font-medium text-ink-muted">Add item</strong> to put something inside.</p>
    </div>
  </div>
</template>
