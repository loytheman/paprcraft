<script setup>
// Edit the declaration box: heading, declaration text, the signature / name / date labels, and the
// signer ({{declaration_signature}}, the form's signature field, printed next to the signature line).
//   item: { title?, text?, signatureLabel?, nameLabel?, dateLabel?, signer? }
import { inject, reactive, ref } from 'vue';
import OpButton from '@ds/components/OpButton.vue';
import OpInput from '@ds/components/OpInput.vue';
import TplDialog from './TplDialog.vue';
import TokenInput from './TokenInput.vue';
import { TPL_KEY } from '@/helpers/template/context';
import { cleanDeclaration, declarationDefault } from '@/helpers/template/blocks';

const ctx = inject(TPL_KEY);
const visible = ref(false);
const target = ref(null);
const draft = reactive({ ...declarationDefault() });

const open = (block) => {
  target.value = block;
  const it = JSON.parse(JSON.stringify(block.item ?? {})); // a new block already carries the defaults; an emptied field stays empty
  for (const k of Object.keys(declarationDefault())) draft[k] = it[k] ?? '';
  visible.value = true;
};
const save = () => {
  target.value.item = { ...cleanDeclaration(draft) };
  visible.value = false;
};
defineExpose({ open });
</script>

<template>
  <TplDialog :open="visible" title="Declaration" @close="visible = false">
    <div class="space-y-3">
      <OpInput v-model="draft.title" label="Heading" />
      <TokenInput v-model="draft.text" label="Declaration text" area hide-picker />
      <div class="grid gap-3 sm:grid-cols-3">
        <OpInput v-model="draft.signatureLabel" label="Signature line" />
        <OpInput v-model="draft.nameLabel" label="Name line" />
        <OpInput v-model="draft.dateLabel" label="Date line" />
      </div>
      <TokenInput v-model="draft.signer" label="Signer (optional)" :schema="ctx.formSchema" hint="A field of the form, e.g. the signature field. Printed next to the signature line." placeholder="{{declaration_signature}}" />
    </div>
    <template #footer>
      <OpButton variant="secondary" @click="visible = false">Cancel</OpButton>
      <OpButton @click="save">Save</OpButton>
    </template>
  </TplDialog>
</template>
