<script setup>
// The account's form submissions: filter by form and status, search, start a new one from a
// published form, open one.
import { computed, onMounted, ref, watch } from 'vue';
import { RouterLink, useRouter } from 'vue-router';
import OpButton from '@ds/components/OpButton.vue';
import OpInput from '@ds/components/OpInput.vue';
import OpSelect from '@ds/components/OpSelect.vue';
import OpStatusBadge from '@ds/components/OpStatusBadge.vue';
import PageSkeleton from '@/components/PageSkeleton.vue';
import TplDialog from '@/components/template/TplDialog.vue';
import * as SubmissionService from '@/services/service.submission';
import { actorName, matchesSearch, statusMeta, STATUSES, submissionTitle } from '@/helpers/forms/submission';
import { formatDateTime } from '@/helpers/Format';
import { canEdit } from '@/team';

const router = useRouter();
const rows = ref([]);
const forms = ref([]);
const loaded = ref(false);
const error = ref('');
const search = ref('');
const formFilter = ref('');
const statusFilter = ref('');

const load = async () => {
  try {
    rows.value = await SubmissionService.listSubmissions({ formId: formFilter.value, status: statusFilter.value });
    error.value = '';
  } catch (e) {
    error.value = e.message || 'Could not load the submissions.';
  }
  loaded.value = true;
};
onMounted(async () => {
  try { forms.value = await SubmissionService.listForms(); } catch { forms.value = []; }
  await load();
});
watch([formFilter, statusFilter], load);

const shown = computed(() => rows.value.filter((r) => matchesSearch(r, search.value)));
const formOptions = computed(() => [{ value: '', label: 'All forms' }, ...forms.value.map((f) => ({ value: f.id, label: f.name }))]);
const statusOptions = [{ value: '', label: 'Any status' }, ...STATUSES.map((s) => ({ value: s, label: statusMeta(s).label }))];
const published = computed(() => forms.value.filter((f) => f.status === 'published'));
const hasFilters = computed(() => !!(formFilter.value || statusFilter.value || search.value.trim()));

// New submission
const creating = ref(false);
const pickForm = ref('');
const draftTitle = ref('');
const busy = ref(false);
const createError = ref('');
const openNew = () => {
  creating.value = true;
  createError.value = '';
  pickForm.value = published.value[0]?.id ?? '';
  draftTitle.value = '';
};
const create = async () => {
  busy.value = true;
  createError.value = '';
  try {
    const s = await SubmissionService.createSubmission({ formId: pickForm.value, title: draftTitle.value.trim() });
    router.push({ name: 'submission', params: { id: s.id } });
  } catch (e) {
    createError.value = e.fieldErrors?.[0]?.message || e.message || 'Could not start the submission.';
  }
  busy.value = false;
};
</script>

<template>
  <div class="mx-auto max-w-5xl">
    <p class="eyebrow">Forms</p>
    <div class="mt-2 flex flex-wrap items-end justify-between gap-3">
      <h1 class="text-h2 text-ink">Submissions</h1>
      <OpButton v-if="canEdit" icon="plus" @click="openNew">New submission</OpButton>
    </div>
    <p class="mt-2 text-body text-ink-muted">Filled-in forms. Fill one in yourself or share a link so the customer does, then review it and generate the document.</p>

    <p v-if="error" role="alert" class="status-down mt-6 rounded-control border px-3 py-2 text-small">{{ error }}</p>

    <div class="mt-6 grid gap-3 sm:grid-cols-3">
      <OpInput v-model="search" label="Search" placeholder="Title or form" />
      <OpSelect v-model="formFilter" label="Form" :options="formOptions" />
      <OpSelect v-model="statusFilter" label="Status" :options="statusOptions" />
    </div>

    <PageSkeleton v-if="!loaded" kind="list" class="mt-8" />
    <section v-else class="mt-4 overflow-hidden rounded-sheet border border-line bg-surface-2">
      <div v-if="!rows.length && !hasFilters" class="px-6 py-10 text-center">
        <p class="text-body text-ink-muted">No submissions yet.</p>
        <p v-if="canEdit && !published.length" class="mt-1 text-small text-ink-faint">Publish a form first, then start a submission from it.</p>
        <OpButton v-if="canEdit && published.length" class="mt-4" icon="plus" @click="openNew">Start the first one</OpButton>
      </div>
      <p v-else-if="!shown.length" class="px-6 py-8 text-center text-body text-ink-muted">Nothing matches these filters.</p>
      <ul v-else>
        <li v-for="s in shown" :key="s.id" class="flex flex-wrap items-center justify-between gap-3 border-b border-line-faint px-5 py-3 last:border-b-0">
          <div class="min-w-0">
            <RouterLink :to="{ name: 'submission', params: { id: s.id } }" class="text-body font-medium text-ink hover:text-cyan">{{ submissionTitle(s) }}</RouterLink>
            <p class="text-small text-ink-faint">
              {{ s.formName }}
              <template v-if="s.submittedAt"> · submitted {{ formatDateTime(s.submittedAt) }}<template v-if="actorName(s.submittedBy)"> by {{ actorName(s.submittedBy) }}</template></template>
              <template v-else> · edited {{ formatDateTime(s.updatedAt) }}</template>
            </p>
          </div>
          <div class="flex items-center gap-3">
            <span v-if="s.status === 'draft' && s.publicExpiresAt && !s.publicLockedAt && Date.parse(s.publicExpiresAt) > Date.now()" class="text-small text-ink-faint">with customer</span>
            <OpStatusBadge :status="statusMeta(s.status).tone">{{ statusMeta(s.status).label }}</OpStatusBadge>
            <RouterLink :to="{ name: 'submission', params: { id: s.id } }"><OpButton size="sm" variant="secondary">{{ canEdit && s.status === 'draft' ? 'Open' : 'View' }}</OpButton></RouterLink>
          </div>
        </li>
      </ul>
    </section>

    <TplDialog :open="creating" title="New submission" @close="creating = false">
      <p v-if="!published.length" class="text-body text-ink-muted">You have no published forms. Publish a form first, then start a submission from it.</p>
      <form v-else class="space-y-3" @submit.prevent="create">
        <OpSelect v-model="pickForm" label="Form" :options="published.map((f) => ({ value: f.id, label: f.name }))" />
        <OpInput v-model="draftTitle" label="Title (optional)" placeholder="e.g. Acme Pte Ltd" hint="Helps you find it later. You can change it any time while it is a draft." />
        <p v-if="createError" role="alert" class="status-down rounded-control border px-3 py-2 text-small">{{ createError }}</p>
      </form>
      <template #footer>
        <OpButton variant="ghost" @click="creating = false">Cancel</OpButton>
        <OpButton v-if="published.length" :disabled="busy || !pickForm" @click="create">{{ busy ? 'Creating…' : 'Create and open' }}</OpButton>
      </template>
    </TplDialog>
  </div>
</template>
