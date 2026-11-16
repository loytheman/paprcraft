<script setup>
// Checklist table: a grey title row, an optional sub heading, then numbered questions with
// Yes / No checkboxes on the right. Click to edit (DialogChecklist).
//   item: { title, subtitle?, rows: [{ text, value }] }   value is a "{{field.optionKey}}" token
import { computed, inject } from 'vue';
import OpIcon from '@ds/components/OpIcon.vue';
import { TPL_KEY } from '@/helpers/template/context';
import { singleToken, validateFormBlock } from '@/helpers/template/blocks';

const props = defineProps({ block: { type: Object, required: true } });
const ctx = inject(TPL_KEY);
const rows = computed(() => props.block.item?.rows ?? []);
const problems = computed(() => validateFormBlock(props.block));
const open = () => { if (!ctx.readonly) ctx.openDialog('checklist', props.block); };
</script>

<template>
  <div class="w-full" :class="!ctx.readonly && 'cursor-pointer'" @click="open">
    <div class="mb-1 flex items-center gap-1.5 text-small text-ink-faint">
      <OpIcon name="check" :size="14" /> Checklist table
      <OpIcon v-if="!ctx.readonly" name="pencil" :size="12" />
      <span v-if="problems.length" class="ml-1 text-warn" :title="problems.join('\n')">needs attention ({{ problems.length }})</span>
    </div>
    <div class="overflow-hidden rounded-control border border-line-strong text-body">
      <div class="border-b border-line-strong bg-white/8 px-3 py-1.5 font-medium text-ink">{{ block.item?.title || 'Untitled' }}</div>
      <div v-if="block.item?.subtitle" class="border-b border-line px-3 py-1 text-small text-ink-muted">{{ block.item.subtitle }}</div>
      <div v-for="(r, i) in rows" :key="i" class="flex items-center gap-3 border-b border-line px-3 py-2 last:border-b-0">
        <p class="min-w-0 flex-1 text-small text-ink-muted"><span class="mr-1 text-ink-faint">{{ i + 1 }}.</span>{{ r.text || '(question)' }}</p>
        <p class="shrink-0 text-right font-mono text-small text-ink-faint">
          <span class="mr-3">☐ YES</span><span>☐ NO</span>
          <span v-if="singleToken(r.value)" class="ml-3 rounded-full border border-cyan/40 bg-cyan/10 px-1.5 text-[0.7rem] text-cyan">{{ singleToken(r.value) }}</span>
          <span v-else class="ml-3 text-warn">no answer set</span>
        </p>
      </div>
      <p v-if="!rows.length" class="px-3 py-3 text-small text-ink-faint">No questions yet. Click to add some.</p>
    </div>
  </div>
</template>
