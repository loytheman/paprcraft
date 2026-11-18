<script setup>
// The account's forms: open, duplicate, delete, create, or start from a master form published by
// Paprcraft staff (its document template comes along).
import { computed, onMounted, ref } from 'vue';
import { RouterLink, useRouter } from 'vue-router';
import OpButton from '@ds/components/OpButton.vue';
import OpInput from '@ds/components/OpInput.vue';
import OpStatusBadge from '@ds/components/OpStatusBadge.vue';
import PageSkeleton from '@/components/PageSkeleton.vue';
import TplDialog from '@/components/template/TplDialog.vue';
import * as FormService from '@/services/service.form';
import { askConfirm } from '@/helpers/Confirm';
import { formatDateTime } from '@/helpers/Format';
import { canEdit } from '@/team';

const router = useRouter();
const forms = ref([]);
const loaded = ref(false);
const error = ref('');
const search = ref('');

const load = async () => {
  try {
    forms.value = await FormService.listForms();
    error.value = '';
  } catch (e) {
    error.value = e.message || 'Could not load your forms.';
  }
  loaded.value = true;
};
onMounted(load);

const shown = computed(() => {
  const needle = search.value.trim().toLowerCase();
  return needle ? forms.value.filter((f) => f.name.toLowerCase().includes(needle)) : forms.value;
});
const who = (f) => f.updatedBy?.name || f.updatedBy?.email || f.createdBy?.name || f.createdBy?.email || '';

// New form
const creating = ref(false);
const draftName = ref('');
const createError = ref('');
const busy = ref(false);
const create = async () => {
  busy.value = true;
  createError.value = '';
  try {
    const f = await FormService.createForm({ name: draftName.value.trim() });
    router.push({ name: 'form', params: { id: f.id } });
  } catch (e) {
    createError.value = e.fieldErrors?.[0]?.message || e.message || 'Could not create the form.';
  }
  busy.value = false;
};

const duplicate = async (f) => {
  const ok = await askConfirm({ title: `Duplicate "${f.name}"?`, message: 'A copy of the form is created and opened. The original stays as it is.', confirmLabel: 'Duplicate', icon: 'copy', tone: 'primary' });
  if (!ok) return;
  error.value = '';
  try {
    const copy = await FormService.duplicateForm(f.id);
    router.push({ name: 'form', params: { id: copy.id } });
  } catch (e) {
    error.value = e.message || 'Could not duplicate the form.';
  }
};
const remove = async (f) => {
  const ok = await askConfirm({ title: `Delete "${f.name}"?`, message: 'A form that still has submissions can\'t be deleted: delete those first.', confirmLabel: 'Delete form' });
  if (!ok) return;
  try {
    await FormService.deleteForm(f.id);
    await load();
  } catch (e) {
    error.value = e.message || 'Could not delete the form.';
  }
};

// Master forms
const showMasters = ref(false);
const masters = ref([]);
const mastersError = ref('');
const mastersLoaded = ref(false);
const cloningId = ref('');
const openMasters = async () => {
  showMasters.value = true;
  mastersError.value = '';
  try {
    masters.value = (await FormService.listMasters()).filter((m) => m.status === 'published'); // drafts are staff's work in progress
  } catch (e) {
    mastersError.value = e.message || 'Could not load the master forms.';
  }
  mastersLoaded.value = true;
};
const useMaster = async (m) => {
  mastersError.value = '';
  cloningId.value = m.id;
  try {
    const f = await FormService.cloneMaster(m.id);
    router.push({ name: 'form', params: { id: f.id } });
  } catch (e) {
    mastersError.value = e.message || 'Could not copy the form.';
  }
  cloningId.value = '';
};
</script>

<template>
  <div class="mx-auto max-w-4xl">
    <p class="eyebrow">Forms</p>
    <div class="mt-2 flex flex-wrap items-end justify-between gap-3">
      <h1 class="text-h2 text-ink">Forms</h1>
      <div v-if="canEdit" class="flex gap-2">
        <OpButton variant="secondary" @click="openMasters">Master forms</OpButton>
        <OpButton icon="plus" @click="creating = !creating">New form</OpButton>
      </div>
    </div>
    <p class="mt-2 text-body text-ink-muted">Design a form once, then fill it in with your team or share a link with customers. Each filled-in form becomes a submission you can review and turn into a document.</p>

    <form v-if="creating && canEdit" class="mt-6 flex flex-wrap items-end gap-3 rounded-sheet border border-line bg-surface-2 p-4" @submit.prevent="create">
      <OpInput v-model="draftName" class="w-72" label="Form name" placeholder="e.g. Customer due diligence" :error="createError" required />
      <OpButton type="submit" :disabled="busy || !draftName.trim()">{{ busy ? 'Creating…' : 'Create and open' }}</OpButton>
      <OpButton type="button" variant="ghost" @click="creating = false">Cancel</OpButton>
    </form>

    <p v-if="error" role="alert" class="status-down mt-6 rounded-control border px-3 py-2 text-small">{{ error }}</p>
    <PageSkeleton v-if="!loaded" kind="list" class="mt-8" />

    <section v-else class="mt-6">
      <OpInput v-if="forms.length > 4" v-model="search" class="mb-3 max-w-xs" label="Search" placeholder="Form name" />
      <div class="overflow-hidden rounded-sheet border border-line bg-surface-2">
        <p v-if="!forms.length" class="px-6 py-10 text-center text-body text-ink-muted">No forms yet. Create one, or start from a master form.</p>
        <p v-else-if="!shown.length" class="px-6 py-8 text-center text-body text-ink-muted">Nothing matches "{{ search }}".</p>
        <ul v-else>
          <li v-for="f in shown" :key="f.id" class="flex flex-wrap items-center justify-between gap-3 border-b border-line-faint px-5 py-3 last:border-b-0">
            <div class="min-w-0">
              <div class="flex flex-wrap items-center gap-2">
                <RouterLink :to="{ name: 'form', params: { id: f.id } }" class="text-body font-medium text-ink hover:text-primary-active">{{ f.name }}</RouterLink>
                <OpStatusBadge :status="f.status === 'published' ? 'ok' : 'info'">{{ f.status === 'published' ? `Published v${f.version}` : 'Draft' }}</OpStatusBadge>
              </div>
              <p class="text-small text-ink-faint">Edited {{ formatDateTime(f.updatedAt) }}<template v-if="who(f)"> by {{ who(f) }}</template></p>
            </div>
            <div class="flex gap-2">
              <RouterLink :to="{ name: 'form', params: { id: f.id } }"><OpButton size="sm" variant="secondary">{{ canEdit ? 'Open' : 'View' }}</OpButton></RouterLink>
              <OpButton v-if="canEdit" size="sm" variant="secondary" icon="copy" @click="duplicate(f)">Duplicate</OpButton>
              <OpButton v-if="canEdit" size="sm" variant="destructive" icon="trash" @click="remove(f)">Delete</OpButton>
            </div>
          </li>
        </ul>
      </div>
    </section>

    <TplDialog :open="showMasters" title="Master forms" @close="showMasters = false">
      <p class="text-body text-ink-muted">Ready-made forms from Paprcraft. Using one makes your own copy (a draft) and its document template, which you can edit freely.</p>
      <p v-if="mastersError" role="alert" class="status-down mt-3 rounded-control border px-3 py-2 text-small">{{ mastersError }}</p>
      <p v-if="mastersLoaded && !masters.length && !mastersError" class="mt-4 text-body text-ink-muted">There are no master forms yet.</p>
      <ul class="mt-4 divide-y divide-line-faint rounded-control border border-line">
        <li v-for="m in masters" :key="m.id" class="flex items-center justify-between gap-3 px-4 py-2.5">
          <span class="min-w-0"><span class="block truncate text-body text-ink">{{ m.name }}</span><span v-if="m.description" class="block truncate text-small text-ink-faint">{{ m.description }}</span></span>
          <OpButton size="sm" :disabled="!!cloningId" @click="useMaster(m)">{{ cloningId === m.id ? 'Copying…' : 'Use this form' }}</OpButton>
        </li>
      </ul>
      <template #footer><OpButton variant="secondary" @click="showMasters = false">Close</OpButton></template>
    </TplDialog>
  </div>
</template>
