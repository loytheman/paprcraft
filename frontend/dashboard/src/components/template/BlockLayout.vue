<script setup>
// Layout blocks, drawn roughly as they print: page breaks, the letterhead, the company header, the
// "Companies Act" heading and Form 45B. Click to edit the text (DialogLayout).
import { computed, inject } from 'vue';
import OpIcon from '@ds/components/OpIcon.vue';
import { TPL_KEY } from '@/helpers/template/context';

const props = defineProps({ block: { type: Object, required: true } });
const ctx = inject(TPL_KEY);
const d = computed(() => props.block.item?.data ?? {});
const editable = computed(() => props.block.type !== 'page-break' && !ctx.readonly);
const open = () => { if (editable.value) ctx.openDialog('layout', props.block); };
const NAMES = {
  'layout-corpsec-header-01': 'Letterhead',
  'layout-company-header-01': 'Company header',
  'layout-company-act': 'Act heading',
  'layout-form-45b': 'Form 45B',
  'page-break': 'Page break',
  'page-break-02': 'Page break with page numbers',
};
</script>

<template>
  <div class="tpl-stripes w-full p-2" :class="editable && 'cursor-pointer'" @click="open">
    <div class="mb-1 flex items-center gap-1.5 text-small text-ink-faint">
      <OpIcon :name="block.type.startsWith('page-break') ? 'menu' : 'layout'" :size="14" />
      {{ NAMES[block.type] ?? block.type }}
      <OpIcon v-if="editable" name="pencil" :size="12" />
    </div>

    <div v-if="block.type === 'page-break'" class="border-t border-dashed border-line-strong pt-1 text-center font-mono text-label uppercase text-ink-faint">next page</div>

    <div v-else-if="block.type === 'page-break-02'" class="text-small text-ink-muted">
      <p class="text-right">.../{{ d.footerPageNo || '2' }}</p>
      <p class="border-y border-dashed border-line-strong py-1 text-center font-mono text-label uppercase text-ink-faint">next page</p>
      <p class="text-center">-{{ d.headerPageNo || '2' }}-</p>
    </div>

    <div v-else-if="block.type === 'layout-corpsec-header-01'" class="text-body">
      <p class="font-semibold text-ink">{{ d.companyName || 'Company name' }}</p>
      <p v-if="d.companyRegNo" class="text-small text-ink-muted">{{ d.companyRegNo }}</p>
      <p v-for="(line, i) in String(d.subHeader ?? '').split('\n').filter(Boolean)" :key="i" class="text-small text-ink-muted">{{ line }}</p>
    </div>

    <div v-else-if="block.type === 'layout-company-header-01'" class="text-center">
      <p class="text-h3 font-semibold text-ink">{{ d.companyName || 'Company name' }}</p>
      <p v-if="d.incorporationLine" class="text-small text-ink-muted">{{ d.incorporationLine }}</p>
      <p v-if="d.companyRegNo" class="mt-1 text-small text-ink-muted">Company Registration No. {{ d.companyRegNo }}</p>
      <p v-if="d.subHeader" class="mt-2 text-body text-ink">{{ d.subHeader }}</p>
    </div>

    <div v-else-if="block.type === 'layout-company-act' || block.type === 'layout-form-45b'" class="flex items-start justify-between gap-3">
      <div class="mx-auto w-1/2 min-w-48 border border-line-strong p-2 text-center">
        <p class="text-small font-bold uppercase text-ink">{{ d.title || 'The Companies Act' }}</p>
        <p class="mt-1 text-small font-bold uppercase text-ink-muted">{{ d.subHeader || 'Sub heading' }}</p>
      </div>
      <div v-if="block.type === 'layout-form-45b'" class="text-center text-small text-ink"><p>FORM</p><p class="font-bold">45B</p></div>
    </div>
  </div>
</template>
