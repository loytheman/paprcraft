<script setup>
// Declaration box: a grey heading, the declaration text, and the signature / name / date lines.
// Click to edit (DialogDeclaration).
//   item: { title?, text?, signatureLabel?, nameLabel?, dateLabel?, signer? }
import { computed, inject } from 'vue';
import OpIcon from '@ds/components/OpIcon.vue';
import { TPL_KEY } from '@/helpers/template/context';
import TokenText from './TokenText.vue';

const props = defineProps({ block: { type: Object, required: true } });
const ctx = inject(TPL_KEY);
const d = computed(() => props.block.item ?? {});
const open = () => { if (!ctx.readonly) ctx.openDialog('declaration', props.block); };
</script>

<template>
  <div class="w-full" :class="!ctx.readonly && 'cursor-pointer'" @click="open">
    <div class="mb-1 flex items-center gap-1.5 text-small text-ink-faint">
      <OpIcon name="pencil" :size="14" /> Declaration
      <OpIcon v-if="!ctx.readonly" name="pencil" :size="12" />
    </div>
    <div class="overflow-hidden rounded-control border border-line-strong text-body">
      <div class="border-b border-line-strong bg-white/8 px-3 py-1.5 font-medium text-ink">{{ d.title || 'Declaration' }}</div>
      <div class="space-y-3 px-3 py-2 text-small text-ink-muted">
        <p v-if="d.text">{{ d.text }}</p>
        <p class="text-ink">{{ d.signatureLabel || 'Signature:' }} <span class="inline-block w-48 border-b border-ink-faint align-bottom">&nbsp;</span> <span v-if="d.signer" class="ml-1"><TokenText :text="d.signer" /></span></p>
        <p class="text-ink">{{ d.nameLabel || 'Name' }} <span class="inline-block w-48 border-b border-ink-faint align-bottom">&nbsp;</span></p>
        <p class="text-ink">{{ d.dateLabel || 'Date' }} <span class="inline-block w-32 border-b border-ink-faint align-bottom">&nbsp;</span></p>
      </div>
    </div>
  </div>
</template>
