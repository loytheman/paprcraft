<script setup>
// Signature areas 01 (several signers), 02 (one signer), 03 (signer + company), 04 (centred, with
// company). Click to edit (DialogSign).
import { computed, inject } from 'vue';
import OpIcon from '@ds/components/OpIcon.vue';
import { TPL_KEY } from '@/helpers/template/context';

const props = defineProps({ block: { type: Object, required: true } });
const ctx = inject(TPL_KEY);
const d = computed(() => props.block.item?.data ?? {});
const centred = computed(() => ['sign-area-01', 'sign-area-04'].includes(props.block.type));
const open = () => { if (!ctx.readonly) ctx.openDialog('sign', props.block); };
</script>

<template>
  <div class="tpl-stripes w-full p-2" :class="[!ctx.readonly && 'cursor-pointer']" @click="open">
    <div class="mb-1 flex items-center gap-1.5 text-small text-ink-faint">
      <OpIcon name="pencil" :size="14" /> Signature area ({{ block.type.slice(-2) }})
    </div>
    <div :class="centred ? 'text-center' : ''">
      <p v-if="d.desc && centred" class="mb-2 font-bold tracking-[0.3em] text-ink uppercase">{{ d.desc }}</p>
      <template v-if="block.type === 'sign-area-01'">
        <span v-for="(s, i) in d.signers ?? []" :key="i" class="mr-1 inline-block rounded-full border border-line px-2 text-small text-ink-muted">{{ s.name }}</span>
        <span v-if="!d.signers?.length" class="text-small text-ink-faint">No signers yet</span>
      </template>
      <template v-else>
        <p v-if="d.name" class="inline-block rounded-full border border-line px-2 text-small text-ink-muted">{{ d.name }}</p>
        <span v-else class="text-small text-ink-faint">No signer name yet</span>
        <p v-if="block.type !== 'sign-area-04' && d.desc" class="mt-1 text-body text-ink-muted">{{ d.desc }}</p>
        <p v-if="d.desc2" class="mt-1 text-body" :class="block.type === 'sign-area-03' ? 'font-bold text-ink' : 'text-ink-muted'">{{ d.desc2 }}</p>
        <p v-if="d.desc3" class="font-bold text-ink">{{ d.desc3 }}</p>
      </template>
    </div>
  </div>
</template>
