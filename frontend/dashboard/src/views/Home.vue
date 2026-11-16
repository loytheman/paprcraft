<script setup>
// The signed-in home: a greeting, quick actions, live counts of the account's templates, forms and
// submissions, and the most recent submissions. All numbers come from the API; nothing is invented.
import { computed, onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';
import OpButton from '@ds/components/OpButton.vue';
import OpIcon from '@ds/components/OpIcon.vue';
import OpStatusBadge from '@ds/components/OpStatusBadge.vue';
import { session } from '@/session';
import { canEdit } from '@/team';
import * as TemplateService from '@/services/service.template';
import * as FormService from '@/services/service.form';
import * as SubmissionService from '@/services/service.submission';
import { formatRelative } from '@/helpers/Format';
import { statusMeta, submissionTitle } from '@/helpers/forms/submission';

const name = computed(() => session.user?.firstName || session.user?.email || '');
const hour = new Date().getHours();
const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

const templates = ref([]);
const forms = ref([]);
const submissions = ref([]);
const loaded = ref(false);
const error = ref('');

onMounted(async () => {
  try {
    [templates.value, forms.value, submissions.value] = await Promise.all([
      TemplateService.listTemplates(),
      FormService.listForms(),
      SubmissionService.listSubmissions(),
    ]);
  } catch (e) {
    error.value = e.message || 'Could not load your workspace.';
  }
  loaded.value = true;
});

const count = (status) => submissions.value.filter((s) => s.status === status).length;
const stats = computed(() => [
  { label: 'Templates', value: templates.value.length, hint: 'document layouts', icon: 'copy', to: 'templates' },
  { label: 'Forms', value: forms.value.length, hint: `${forms.value.filter((f) => f.status === 'published').length} published`, icon: 'braces', to: 'forms' },
  { label: 'Awaiting review', value: count('submitted'), hint: 'submitted, no decision yet', icon: 'clock', to: 'submissions', accent: true },
  { label: 'Approved', value: count('approved'), hint: `${submissions.value.length} submissions in total`, icon: 'check', to: 'submissions' },
]);
const recent = computed(() => [...submissions.value].sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt))).slice(0, 6));
</script>

<template>
  <div class="mx-auto max-w-6xl">
    <section class="relative overflow-hidden rounded-sheet border border-line-soft bg-surface-1 p-6 shadow-rim md:p-8">
      <div class="pointer-events-none absolute -top-24 -right-24 size-80 rounded-full bg-primary-soft blur-3xl" aria-hidden="true"></div>
      <div class="relative flex flex-wrap items-end justify-between gap-6">
        <div class="max-w-xl">
          <p class="eyebrow">Workspace</p>
          <h1 class="mt-2 text-display text-ink">{{ greeting }}, {{ name }}</h1>
          <p class="mt-3 text-body text-ink-muted">Build a form, send customers a link, then turn the answers into a Word document from your template.</p>
        </div>
        <div v-if="canEdit" class="flex flex-wrap gap-2">
          <RouterLink :to="{ name: 'templates' }"><OpButton variant="secondary" icon="plus">New template</OpButton></RouterLink>
          <RouterLink :to="{ name: 'submissions' }"><OpButton icon="plus">New submission</OpButton></RouterLink>
        </div>
      </div>
    </section>

    <p v-if="error" role="alert" class="status-down mt-6 rounded-control border px-3 py-2 text-small">{{ error }}</p>

    <section class="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4" aria-label="Summary">
      <RouterLink v-for="s in stats" :key="s.label" :to="{ name: s.to }" class="group rounded-sheet border border-line-soft bg-surface-1 p-5 shadow-rim transition-shadow hover:shadow-lift">
        <div class="flex items-center justify-between">
          <span class="flex size-9 items-center justify-center rounded-control" :class="s.accent ? 'bg-secondary-soft text-secondary-ink' : 'bg-primary-soft text-primary-text'"><OpIcon :name="s.icon" :size="18" /></span>
          <span class="text-small font-medium text-ink-muted">{{ s.label }}</span>
        </div>
        <p class="mt-4 text-display text-ink">{{ loaded ? s.value : '–' }}</p>
        <p class="mt-1 text-small text-ink-faint">{{ s.hint }}</p>
      </RouterLink>
    </section>

    <section class="mt-6 overflow-hidden rounded-sheet border border-line-soft bg-surface-1 shadow-rim">
      <div class="flex items-center justify-between border-b border-line-soft px-5 py-4">
        <h2 class="text-h3 text-ink">Recent submissions</h2>
        <RouterLink :to="{ name: 'submissions' }" class="text-small font-medium text-primary-text hover:underline">View all</RouterLink>
      </div>
      <p v-if="loaded && !recent.length" class="px-5 py-10 text-center text-body text-ink-muted">Nothing yet. Publish a form, then start a submission or send a customer link.</p>
      <ul v-else>
        <li v-for="s in recent" :key="s.id" class="flex flex-wrap items-center justify-between gap-3 border-b border-line-faint px-5 py-3 last:border-b-0 hover:bg-sunken">
          <div class="min-w-0">
            <RouterLink :to="{ name: 'submission', params: { id: s.id } }" class="text-body font-medium text-ink hover:text-primary-active">{{ submissionTitle(s) }}</RouterLink>
            <p class="text-small text-ink-faint">{{ s.formName }} · updated {{ formatRelative(s.updatedAt) }}</p>
          </div>
          <OpStatusBadge :status="statusMeta(s.status).tone">{{ statusMeta(s.status).label }}</OpStatusBadge>
        </li>
      </ul>
    </section>
  </div>
</template>
