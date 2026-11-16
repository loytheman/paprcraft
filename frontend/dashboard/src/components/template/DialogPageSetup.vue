<script setup>
// Page setup of the whole template: the look (Letter or Form: Calibri, narrow margins, grey table
// headers, like the CDD forms) and the repeating page header / footer. The footer's right side is
// always "Page N/M". Edits `template.style` and `template.frame` directly on Save.
import { inject, reactive, ref } from 'vue';
import OpButton from '@ds/components/OpButton.vue';
import TplDialog from './TplDialog.vue';
import TokenInput from './TokenInput.vue';
import TokenText from './TokenText.vue';
import { TPL_KEY } from '@/helpers/template/context';
import { BUILTIN_VALUES, PAGE_STYLES, emptyFrame } from '@/helpers/template/blocks';

const ctx = inject(TPL_KEY);
const show = (k) => `{{${k}}}`;
const visible = ref(false);
const target = ref(null);
const draft = reactive({ style: 'letter', ...emptyFrame() });

const open = (template) => {
  target.value = template;
  draft.style = template.style || 'letter';
  const f = { ...emptyFrame(), ...(template.frame ?? {}) };
  draft.headerLeft = f.headerLeft;
  draft.headerRight = f.headerRight;
  draft.footerLeft = f.footerLeft;
  visible.value = true;
};
const save = () => {
  const t = target.value;
  t.style = draft.style;
  t.frame = { headerLeft: draft.headerLeft.trim(), headerRight: draft.headerRight.trim(), footerLeft: draft.footerLeft.trim() };
  visible.value = false;
};
defineExpose({ open });
</script>

<template>
  <TplDialog :open="visible" title="Page setup" @close="visible = false">
    <fieldset class="space-y-1.5">
      <legend class="mb-1 text-small font-medium text-ink-muted">Look</legend>
      <label v-for="s in PAGE_STYLES" :key="s.value" class="flex cursor-pointer items-center gap-2 text-body text-ink-muted">
        <input v-model="draft.style" type="radio" :value="s.value" class="accent-cyan" /> {{ s.label }}
      </label>
    </fieldset>

    <div class="mt-5 space-y-3">
      <p class="text-small font-medium text-ink-muted">Page header and footer (every page)</p>
      <div class="grid gap-3 sm:grid-cols-2">
        <TokenInput v-model="draft.headerLeft" label="Header, left" :schema="ctx.formSchema" placeholder="Customer Due Diligence Form" />
        <TokenInput v-model="draft.headerRight" label="Header, right" :schema="ctx.formSchema" placeholder="Case Reference: {{submission_ref}}" />
      </div>
      <TokenInput v-model="draft.footerLeft" label="Footer, left" :schema="ctx.formSchema" placeholder="Your firm name" hint="The footer's right side always reads Page N/M." />
    </div>

    <div class="mt-4">
      <p class="mb-1 text-small font-medium text-ink-muted">Preview</p>
      <div class="rounded-control border border-line bg-surface-1 p-3 text-small">
        <div class="flex justify-between rounded-sm px-2 py-1" :class="draft.style === 'form' ? 'bg-white/10' : 'border-b border-line-soft'">
          <span class="text-ink-muted"><TokenText :text="draft.headerLeft" empty="(no header)" /></span>
          <span class="text-ink-muted"><TokenText :text="draft.headerRight" /></span>
        </div>
        <p class="py-6 text-center text-ink-faint">… page content …</p>
        <div class="flex justify-between rounded-sm px-2 py-1" :class="draft.style === 'form' ? 'bg-white/10' : 'border-t border-line-soft'">
          <span class="text-ink-muted"><TokenText :text="draft.footerLeft" empty="(no footer)" /></span>
          <span class="text-ink-muted">Page 1/1</span>
        </div>
      </div>
    </div>

    <p class="mt-3 text-small text-ink-faint">
      Built-in values you can use here and anywhere a field goes:
      <span v-for="b in BUILTIN_VALUES" :key="b.key" class="mr-1 inline-block font-mono text-ink-muted" :title="b.label">{{ show(b.key) }}</span>
    </p>

    <template #footer>
      <OpButton variant="secondary" @click="visible = false">Cancel</OpButton>
      <OpButton @click="save">Apply</OpButton>
    </template>
  </TplDialog>
</template>
