<script setup>
// The account's document templates: open, duplicate, delete, create, or start from a master
// template published by Paprcraft staff.
import { computed, onMounted, ref } from 'vue';
import { RouterLink, useRouter } from 'vue-router';
import OpButton from '@ds/components/OpButton.vue';
import OpInput from '@ds/components/OpInput.vue';
import PageSkeleton from '@/components/PageSkeleton.vue';
import TplDialog from '@/components/template/TplDialog.vue';
import * as TemplateService from '@/services/service.template';
import { askConfirm } from '@/helpers/Confirm';
import { formatDateTime } from '@/helpers/Format';
import { canEdit } from '@/team';

const router = useRouter();
const templates = ref([]);
const loaded = ref(false);
const error = ref('');
const search = ref('');

const load = async () => {
  try {
    templates.value = await TemplateService.listTemplates();
    error.value = '';
  } catch (e) {
    error.value = e.message || 'Could not load your templates.';
  }
  loaded.value = true;
};
onMounted(load);

const shown = computed(() => {
  const needle = search.value.trim().toLowerCase();
  return needle ? templates.value.filter((t) => t.name.toLowerCase().includes(needle)) : templates.value;
});
const who = (t) => t.updatedBy?.name || t.updatedBy?.email || t.createdBy?.name || t.createdBy?.email || '';

// New template
const creating = ref(false);
const draftName = ref('');
const createError = ref('');
const busy = ref(false);
const create = async () => {
  busy.value = true;
  createError.value = '';
  try {
    const t = await TemplateService.createTemplate({ name: draftName.value.trim() });
    router.push({ name: 'template', params: { id: t.id } });
  } catch (e) {
    createError.value = e.fieldErrors?.[0]?.message || e.message || 'Could not create the template.';
  }
  busy.value = false;
};

const duplicate = async (t) => {
  error.value = '';
  try {
    const copy = await TemplateService.duplicateTemplate(t.id);
    router.push({ name: 'template', params: { id: copy.id } });
  } catch (e) {
    error.value = e.message || 'Could not duplicate the template.';
  }
};
const remove = async (t) => {
  const ok = await askConfirm({ title: `Delete "${t.name}"?`, message: 'The template and its exported documents are deleted.', confirmLabel: 'Delete template' });
  if (!ok) return;
  try {
    await TemplateService.deleteTemplate(t.id);
    await load();
  } catch (e) {
    error.value = e.message || 'Could not delete the template.';
  }
};

// Master templates
const showMasters = ref(false);
const masters = ref([]);
const mastersError = ref('');
const mastersLoaded = ref(false);
const openMasters = async () => {
  showMasters.value = true;
  mastersError.value = '';
  try {
    masters.value = await TemplateService.listMasters();
  } catch (e) {
    mastersError.value = e.message || 'Could not load the master templates.';
  }
  mastersLoaded.value = true;
};
const useMaster = async (m) => {
  mastersError.value = '';
  try {
    const t = await TemplateService.cloneMaster(m.id);
    router.push({ name: 'template', params: { id: t.id } });
  } catch (e) {
    mastersError.value = e.message || 'Could not copy the template.';
  }
};
</script>

<template>
  <div class="mx-auto max-w-4xl">
    <p class="eyebrow">Documents</p>
    <div class="mt-2 flex flex-wrap items-end justify-between gap-3">
      <h1 class="text-h2 text-ink">Templates</h1>
      <div v-if="canEdit" class="flex gap-2">
        <OpButton variant="secondary" @click="openMasters">Master templates</OpButton>
        <OpButton icon="plus" @click="creating = !creating">New template</OpButton>
      </div>
    </div>
    <p class="mt-2 text-body text-ink-muted">Write a document once with placeholders, then generate a Word file whenever you need it.</p>

    <form v-if="creating && canEdit" class="mt-6 flex flex-wrap items-end gap-3 rounded-sheet border border-line bg-surface-2 p-4" @submit.prevent="create">
      <OpInput v-model="draftName" class="w-72" label="Template name" placeholder="e.g. AGM notice" :error="createError" required />
      <OpButton type="submit" :disabled="busy || !draftName.trim()">{{ busy ? 'Creating…' : 'Create and open' }}</OpButton>
      <OpButton type="button" variant="ghost" @click="creating = false">Cancel</OpButton>
    </form>

    <p v-if="error" role="alert" class="status-down mt-6 rounded-control border px-3 py-2 text-small">{{ error }}</p>
    <PageSkeleton v-if="!loaded" kind="list" class="mt-8" />

    <section v-else class="mt-6">
      <OpInput v-if="templates.length > 4" v-model="search" class="mb-3 max-w-xs" label="Search" placeholder="Template name" />
      <div class="overflow-hidden rounded-sheet border border-line bg-surface-2">
        <p v-if="!templates.length" class="px-6 py-10 text-center text-body text-ink-muted">No templates yet. Create one, or start from a master template.</p>
        <p v-else-if="!shown.length" class="px-6 py-8 text-center text-body text-ink-muted">Nothing matches "{{ search }}".</p>
        <ul v-else>
          <li v-for="t in shown" :key="t.id" class="flex flex-wrap items-center justify-between gap-3 border-b border-line-faint px-5 py-3 last:border-b-0">
            <div class="min-w-0">
              <RouterLink :to="{ name: 'template', params: { id: t.id } }" class="text-body font-medium text-ink hover:text-primary-active">{{ t.name }}</RouterLink>
              <p class="text-small text-ink-faint">Edited {{ formatDateTime(t.updatedAt) }}<template v-if="who(t)"> by {{ who(t) }}</template></p>
            </div>
            <div class="flex gap-2">
              <RouterLink :to="{ name: 'template', params: { id: t.id } }"><OpButton size="sm" variant="secondary">{{ canEdit ? 'Open' : 'View' }}</OpButton></RouterLink>
              <OpButton v-if="canEdit" size="sm" variant="secondary" icon="copy" @click="duplicate(t)">Duplicate</OpButton>
              <OpButton v-if="canEdit" size="sm" variant="destructive" icon="trash" @click="remove(t)">Delete</OpButton>
            </div>
          </li>
        </ul>
      </div>
    </section>

    <TplDialog :open="showMasters" title="Master templates" @close="showMasters = false">
      <p class="text-body text-ink-muted">Ready-made templates from Paprcraft. Using one makes your own copy, which you can edit freely.</p>
      <p v-if="mastersError" role="alert" class="status-down mt-3 rounded-control border px-3 py-2 text-small">{{ mastersError }}</p>
      <p v-if="mastersLoaded && !masters.length && !mastersError" class="mt-4 text-body text-ink-muted">There are no master templates yet.</p>
      <ul class="mt-4 divide-y divide-line-faint rounded-control border border-line">
        <li v-for="m in masters" :key="m.id" class="flex items-center justify-between gap-3 px-4 py-2.5">
          <span class="min-w-0 truncate text-body text-ink">{{ m.name }}</span>
          <OpButton size="sm" @click="useMaster(m)">Use this template</OpButton>
        </li>
      </ul>
      <template #footer><OpButton variant="secondary" @click="showMasters = false">Close</OpButton></template>
    </TplDialog>
  </div>
</template>
