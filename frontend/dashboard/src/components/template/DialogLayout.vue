<script setup>
// The text of the layout blocks: company header, letterhead, "Companies Act" heading, Form 45B,
// and the page numbers of a page break with numbers.
import { computed, reactive, ref } from 'vue';
import OpButton from '@ds/components/OpButton.vue';
import OpInput from '@ds/components/OpInput.vue';
import OpSelect from '@ds/components/OpSelect.vue';
import OpTextarea from '@ds/components/OpTextarea.vue';
import TplDialog from './TplDialog.vue';

const FIELDS = {
  'layout-company-header-01': [
    { key: 'companyName', label: 'Company name' },
    { key: 'companyRegNo', label: 'Registration number' },
    { key: 'incorporationLine', label: 'Incorporation line (optional)', hint: 'Shown under the name, e.g. (Incorporated in ...)' },
    { key: 'subHeader', label: 'Sub header', area: true, presets: ['NOTICE OF ANNUAL GENERAL MEETING', 'MINUTES OF ANNUAL GENERAL MEETING', "DIRECTORS' RESOLUTION IN WRITING", 'AGREEMENT BY MEMBERS TO SHORTER NOTICE'] },
  ],
  'layout-corpsec-header-01': [
    { key: 'companyName', label: 'Name' },
    { key: 'companyRegNo', label: 'Registration number' },
    { key: 'subHeader', label: 'Address and contact', area: true, hint: 'One line per row' },
  ],
  'layout-company-act': [
    { key: 'title', label: 'Title (optional)', hint: 'Leave empty for "THE COMPANIES ACT"' },
    { key: 'subHeader', label: 'Sub header', area: true, presets: ['RETURN OF ALLOTMENT OF SHARES', 'RETURN GIVING PARTICULARS IN REGISTER OF DIRECTORS'] },
  ],
  'layout-form-45b': [
    { key: 'title', label: 'Title (optional)', hint: 'Leave empty for "THE COMPANIES ACT"' },
    { key: 'subHeader', label: 'Sub header', area: true, presets: ['CONSENT TO ACT AS SECRETARY'] },
  ],
  'page-break-02': [
    { key: 'footerPageNo', label: 'Last page number of this page ("…/N")' },
    { key: 'headerPageNo', label: 'Page number at the top of the next page' },
  ],
};
const TITLES = {
  'layout-company-header-01': 'Company header', 'layout-corpsec-header-01': 'Letterhead', 'layout-company-act': 'Act heading', 'layout-form-45b': 'Form 45B', 'page-break-02': 'Page numbers',
};

const visible = ref(false);
const target = ref(null);
const draft = reactive({});
const fields = computed(() => FIELDS[target.value?.type] ?? []);

const open = (block) => {
  target.value = block;
  for (const k of Object.keys(draft)) delete draft[k];
  for (const f of FIELDS[block.type] ?? []) draft[f.key] = block.item?.data?.[f.key] ?? '';
  visible.value = true;
};
const save = () => {
  target.value.item = { ...target.value.item, data: { ...target.value.item?.data, ...JSON.parse(JSON.stringify(draft)) } };
  visible.value = false;
};
defineExpose({ open });
</script>

<template>
  <TplDialog :open="visible" :title="TITLES[target?.type] ?? 'Edit'" @close="visible = false">
    <div class="space-y-3">
      <template v-for="f in fields" :key="f.key">
        <OpTextarea v-if="f.area" v-model="draft[f.key]" :label="f.label" :hint="f.hint" :rows="3" />
        <OpInput v-else v-model="draft[f.key]" :label="f.label" :hint="f.hint" />
        <OpSelect
          v-if="f.presets"
          :model-value="''"
          label="Quick fill"
          :options="[{ value: '', label: 'Choose a suggestion…' }, ...f.presets.map((p) => ({ value: p, label: p }))]"
          @update:model-value="(v) => v && (draft[f.key] = v)"
        />
      </template>
    </div>
    <template #footer>
      <OpButton variant="secondary" @click="visible = false">Cancel</OpButton>
      <OpButton @click="save">Save</OpButton>
    </template>
  </TplDialog>
</template>
