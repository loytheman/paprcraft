<script setup>
// Signature areas: pick the layout (01-04) and fill in the names and roles. Plain text inputs,
// there is no company record to pick from.
import { computed, reactive, ref } from 'vue';
import OpButton from '@ds/components/OpButton.vue';
import OpInput from '@ds/components/OpInput.vue';
import OpIcon from '@ds/components/OpIcon.vue';
import TplDialog from './TplDialog.vue';
import { signDefaults } from '@/helpers/template/blocks';

const ROLES = ['Director', 'Shareholder', 'Corporate Representative of Holding Company'];
const TYPES = [
  { value: 'sign-area-01', label: 'Type 01: several signers, two columns' },
  { value: 'sign-area-02', label: 'Type 02: one signer' },
  { value: 'sign-area-03', label: 'Type 03: signer with company' },
  { value: 'sign-area-04', label: 'Type 04: signer with company, centred' },
];

const visible = ref(false);
const target = ref(null);
const type = ref('sign-area-01');
const draft = reactive({});

const open = (block) => {
  target.value = block;
  type.value = block.type;
  reset(block.type, block.item?.data);
  visible.value = true;
};
// Keep what the new layout shares with the old one (a name stays a name).
const reset = (t, source = {}) => {
  const from = JSON.parse(JSON.stringify(source ?? {})); // copy first: `source` may be the draft itself
  const base = signDefaults(t);
  for (const k of Object.keys(draft)) delete draft[k];
  for (const k of Object.keys(base)) draft[k] = from[k] !== undefined ? from[k] : base[k];
  if (t === 'sign-area-01') draft.signers = (draft.signers ?? []).map((s) => ({ name: s?.name ?? '' }));
};
const onType = () => reset(type.value, draft);

const fieldsByType = computed(() => ({
  'sign-area-01': [],
  'sign-area-02': [['name', 'Signer name'], ['desc', 'Role', true]],
  'sign-area-03': [['name', 'Signer name'], ['desc', 'Role', true], ['desc2', 'Company']],
  'sign-area-04': [['name', 'Signer name'], ['desc2', 'Role', true], ['desc3', 'Company']],
})[type.value]);

const save = () => {
  const data = JSON.parse(JSON.stringify(draft));
  if (type.value === 'sign-area-01') data.signers = (data.signers ?? []).filter((s) => s.name.trim()).map((s) => ({ name: s.name.trim() }));
  target.value.type = type.value;
  target.value.item = { ...target.value.item, data };
  visible.value = false;
};

defineExpose({ open });
</script>

<template>
  <TplDialog :open="visible" title="Signature area" @close="visible = false">
    <fieldset class="space-y-1.5">
      <legend class="mb-1 text-small font-medium text-ink-muted">Layout</legend>
      <label v-for="t in TYPES" :key="t.value" class="flex cursor-pointer items-center gap-2 text-body text-ink-muted">
        <input v-model="type" type="radio" :value="t.value" class="accent-cyan" @change="onType" /> {{ t.label }}
      </label>
    </fieldset>

    <div class="mt-5 space-y-3">
      <template v-if="type === 'sign-area-01' || type === 'sign-area-04'">
        <OpInput v-model="draft.desc" :label="type === 'sign-area-01' ? 'Heading above the signers' : 'Heading'" />
        <div class="flex flex-wrap gap-1.5">
          <button v-for="r in ROLES" :key="r" type="button" class="rounded-full border border-line px-2 py-0.5 text-small text-ink-muted hover:text-ink" @click="draft.desc = r.toUpperCase()">{{ r }}</button>
        </div>
      </template>

      <template v-if="type === 'sign-area-01'">
        <p class="text-small font-medium text-ink-muted">Signers</p>
        <div v-for="(s, i) in draft.signers" :key="i" class="flex items-end gap-2">
          <OpInput v-model="s.name" class="flex-1" :label="`Signer ${i + 1}`" />
          <OpButton variant="ghost" size="sm" aria-label="Remove signer" @click="draft.signers.splice(i, 1)"><OpIcon name="trash" :size="14" /></OpButton>
        </div>
        <OpButton variant="secondary" size="sm" icon="plus" @click="draft.signers.push({ name: '' })">Add signer</OpButton>
      </template>

      <template v-for="[key, label, roles] in fieldsByType" :key="key">
        <OpInput v-model="draft[key]" :label="label" />
        <div v-if="roles" class="flex flex-wrap gap-1.5">
          <button v-for="r in ROLES" :key="r" type="button" class="rounded-full border border-line px-2 py-0.5 text-small text-ink-muted hover:text-ink" @click="draft[key] = r">{{ r }}</button>
        </div>
      </template>
    </div>

    <template #footer>
      <OpButton variant="secondary" @click="visible = false">Cancel</OpButton>
      <OpButton @click="save">Save</OpButton>
    </template>
  </TplDialog>
</template>
