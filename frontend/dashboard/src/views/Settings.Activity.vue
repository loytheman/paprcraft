<script setup>
// The account's audit trail: every change to labels, team and the plan, by a person (with IP, device and city) or by Paprcraft itself, plus sign-ins.
// Kept forever on every plan. Filtered on the server, so each page is full.
import { computed, onMounted, ref, watch } from 'vue';
import OpButton from '@ds/components/OpButton.vue';
import OpIcon from '@ds/components/OpIcon.vue';
import ActivityFeed from '@/components/ActivityFeed.vue';
import PageSkeleton from '@/components/PageSkeleton.vue';
import * as ActivityService from '@/services/service.activity';
import * as LabelService from '@/services/service.label';
import { csvColumns } from '@/helpers/Activity';
import { downloadCsv, toCsv } from '@/helpers/Csv';

const FILTERS = [
  { key: '', label: 'All' },
  { key: 'templates', label: 'Templates' },
  { key: 'forms', label: 'Forms' },
  { key: 'submissions', label: 'Submissions' },
  { key: 'labels', label: 'Labels' },
  { key: 'account', label: 'Account' },
];

const category = ref('');
const rows = ref([]);
const next = ref(null);
const loaded = ref(false);
const loadingMore = ref(false);
const loadError = ref('');
const lookups = ref({});

let request = 0; // a newer filter click wins over a slower earlier one
const load = async (more = false) => {
  const mine = ++request;
  if (more) loadingMore.value = true;
  try {
    const page = await ActivityService.getAccountActivity({ category: category.value, next: more ? next.value : null });
    if (mine !== request) return;
    rows.value = more ? [...rows.value, ...page.results] : page.results;
    next.value = page.next;
    loadError.value = '';
  } catch (e) {
    if (mine === request) loadError.value = e.message || 'Could not load the activity.';
  }
  if (mine === request) {
    loaded.value = true;
    loadingMore.value = false;
  }
};
watch(category, () => {
  loaded.value = false;
  rows.value = [];
  next.value = null;
  load();
});

onMounted(() => {
  load();
  // Names for the ids in "Labels" changes. Not needed to show the page.
  const byId = (list) => Object.fromEntries((list ?? []).map((x) => [x.id, x.name]));
  Promise.allSettled([LabelService.getLabels()]).then(([l]) => {
    lookups.value = { labels: byId(l.value) };
  });
});

// CSV of everything under the current filter, fetched page by page.
const exporting = ref(false);
const exportError = ref('');
const exportCsv = async () => {
  exporting.value = true;
  exportError.value = '';
  try {
    const all = [];
    let cursor = null;
    do {
      const page = await ActivityService.getAccountActivity({ category: category.value, next: cursor, limit: 200 });
      all.push(...page.results);
      cursor = page.next;
    } while (cursor);
    const filter = FILTERS.find((f) => f.key === category.value);
    const name = `paprcraft-activity${category.value ? `-${category.value.toLowerCase()}` : ''}-${new Date().toISOString().slice(0, 10)}.csv`;
    downloadCsv(name, toCsv(all, csvColumns(lookups.value)));
    if (!all.length) exportError.value = `Nothing to export under ${filter.label}.`;
  } catch (e) {
    exportError.value = e.message || 'Could not export the activity.';
  }
  exporting.value = false;
};

const emptyText = computed(() =>
  category.value ? 'Nothing here yet under this filter.' : 'Changes you make, and sign-ins to your account, will show up here.',
);
</script>

<template>
  <div>
    <div class="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p class="eyebrow">Settings</p>
        <h1 class="mt-2 text-h2 text-ink">Activity</h1>
        <p class="mt-2 max-w-2xl text-body text-ink-muted">Every change in your account, who made it and from where, and every sign-in. Kept for as long as you have the account.</p>
      </div>
      <div class="flex flex-col items-end gap-1">
        <OpButton variant="secondary" icon="download" :disabled="exporting || !loaded" @click="exportCsv">{{ exporting ? 'Exporting…' : 'Export CSV' }}</OpButton>
        <span v-if="exportError" role="alert" class="text-small text-down">{{ exportError }}</span>
      </div>
    </div>

    <div class="mt-6 flex flex-wrap gap-2" role="group" aria-label="Show activity for">
      <button
        v-for="f in FILTERS"
        :key="f.key"
        type="button"
        :aria-pressed="category === f.key"
        :class="['rounded-full border px-3 py-1 text-small transition-colors', category === f.key ? 'border-cyan/50 bg-cyan/10 text-ink' : 'border-line text-ink-muted hover:border-line-strong hover:text-ink']"
        @click="category = f.key"
      >{{ f.label }}</button>
    </div>

    <p v-if="loadError" role="alert" class="status-down mt-6 rounded-control border px-3 py-2 text-small">{{ loadError }}</p>

    <PageSkeleton v-if="!loaded" kind="list" class="mt-6" />

    <template v-else>
      <section v-if="!rows.length && !loadError" class="mt-6 flex flex-col items-center rounded-sheet border border-dashed border-line-strong bg-surface-1/50 px-6 py-14 text-center">
        <span class="flex size-12 items-center justify-center rounded-card border border-line bg-surface-3 text-cyan"><OpIcon name="activity" :size="24" /></span>
        <p class="mt-4 max-w-md text-body text-ink-muted">{{ emptyText }}</p>
      </section>

      <ActivityFeed v-else class="mt-6" :rows="rows" :lookups="lookups" />

      <div v-if="next" class="mt-6 flex justify-center">
        <OpButton variant="secondary" :disabled="loadingMore" @click="load(true)">{{ loadingMore ? 'Loading…' : 'Load more' }}</OpButton>
      </div>
    </template>
  </div>
</template>
