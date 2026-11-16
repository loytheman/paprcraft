<script setup>
// Paprcraft staff: every customer account, searchable, with quick filters. Opens a customer's page
// to change their plan, limits or status.
import { onMounted, ref, watch } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import OpButton from '@ds/components/OpButton.vue';
import OpIcon from '@ds/components/OpIcon.vue';
import PageSkeleton from '@/components/PageSkeleton.vue';
import * as StaffService from '@/services/service.staff';
import { formatDate, formatRelative } from '@/helpers/Format';

const FILTERS = [
  { key: '', label: 'All' },
  { key: 'paying', label: 'Paying' },
  { key: 'free', label: 'Free' },
  { key: 'complimentary', label: 'Complimentary' },
  { key: 'pastDue', label: 'Past due' },
  { key: 'custom', label: 'Custom limits' },
  { key: 'suspended', label: 'Suspended' },
  { key: 'staff', label: 'Staff' },
];
const PLAN_NAME = { free: 'Free', pro: 'Pro' };
// Back from closing an account on its page (?closed=email).
const closedEmail = useRoute().query.closed ?? '';

const q = ref('');
const filter = ref('');
const result = ref(null);
const rows = ref([]);
const loaded = ref(false);
const loadingMore = ref(false);
const loadError = ref('');

let request = 0;
const load = async (more = false) => {
  const mine = ++request;
  if (more) loadingMore.value = true;
  try {
    const r = await StaffService.listCustomers({ q: q.value, filter: filter.value, offset: more ? rows.value.length : 0 });
    if (mine !== request) return;
    result.value = r;
    rows.value = more ? [...rows.value, ...r.customers] : r.customers;
    loadError.value = '';
  } catch (e) {
    if (mine === request) loadError.value = e.message || 'Could not load customers.';
  }
  if (mine === request) {
    loaded.value = true;
    loadingMore.value = false;
  }
};
onMounted(load);
watch(filter, () => load());
let typing;
watch(q, () => {
  clearTimeout(typing);
  typing = setTimeout(load, 300);
});

const billingTone = (c) => {
  if (c.status === 'suspended') return { text: 'Suspended', cls: 'status-down' };
  if (['past_due', 'unpaid', 'incomplete'].includes(c.billingStatus)) return { text: 'Past due', cls: 'status-down' };
  if (c.cancelAt) return { text: `Ends ${formatDate(c.cancelAt)}`, cls: 'status-warn' };
  return null;
};
</script>

<template>
  <div>
    <p class="eyebrow !text-violet-soft">Staff</p>
    <h1 class="mt-2 text-h2 text-ink">Customers</h1>
    <p class="mt-2 max-w-2xl text-body text-ink-muted">
      Every Paprcraft account. Open one to make it complimentary, change its limits, suspend it, or read its activity.
      <span v-if="result" class="text-ink-faint">{{ result.total }} accounts.</span>
    </p>

    <p v-if="closedEmail" role="status" class="status-ok mt-4 rounded-control border px-3 py-2 text-small">Closed {{ closedEmail }}'s account. They've been emailed.</p>

    <div class="mt-6 flex flex-wrap items-center gap-3">
      <label class="relative block w-full max-w-sm">
        <span class="sr-only">Search customers</span>
        <OpIcon name="radar" :size="16" class="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-faint" />
        <input v-model="q" type="search" placeholder="Search by email, name or account id" class="w-full rounded-control border border-line bg-surface-1 py-2 pr-3 pl-9 text-body text-ink placeholder:text-ink-faint focus:border-cyan/60 focus:outline-none" />
      </label>
    </div>

    <div class="mt-4 flex flex-wrap gap-2" role="group" aria-label="Show customers">
      <button
        v-for="f in FILTERS"
        :key="f.key"
        type="button"
        :aria-pressed="filter === f.key"
        :class="['rounded-full border px-3 py-1 text-small transition-colors', filter === f.key ? 'border-violet/50 bg-violet/10 text-ink' : 'border-line text-ink-muted hover:border-line-strong hover:text-ink']"
        @click="filter = f.key"
      >
        {{ f.label }}<span v-if="f.key && result?.counts" class="ml-1.5 font-mono text-[11px] text-ink-faint">{{ result.counts[f.key] }}</span>
      </button>
    </div>

    <p v-if="loadError" role="alert" class="status-down mt-6 rounded-control border px-3 py-2 text-small">{{ loadError }}</p>
    <PageSkeleton v-if="!loaded" kind="list" class="mt-6" />

    <template v-else>
      <p v-if="!rows.length && !loadError" class="mt-6 rounded-sheet border border-dashed border-line-strong px-6 py-10 text-center text-body text-ink-muted">No customers match.</p>
      <div v-else class="mt-6 overflow-x-auto rounded-sheet border border-line bg-surface-2">
        <table class="w-full min-w-[44rem] text-left">
          <thead>
            <tr class="border-b border-line font-mono text-label uppercase text-ink-faint">
              <th class="px-4 py-3 font-medium">Customer</th>
              <th class="px-4 py-3 font-medium">Plan</th>
              <th class="px-4 py-3 font-medium">Labels</th>
              <th class="px-4 py-3 font-medium">Last sign-in</th>
              <th class="px-4 py-3 font-medium">Joined</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="c in rows" :key="c.id" class="border-b border-line-faint last:border-b-0 hover:bg-white/2">
              <td class="px-4 py-3">
                <RouterLink :to="{ name: 'staff-customer', params: { id: c.id } }" class="block min-w-0">
                  <span class="block truncate text-body font-medium text-ink hover:text-cyan">{{ c.name || c.email }}</span>
                  <span v-if="c.name" class="block truncate text-small text-ink-faint">{{ c.email }}</span>
                </RouterLink>
              </td>
              <td class="px-4 py-3">
                <div class="flex flex-wrap items-center gap-1.5">
                  <span class="text-body text-ink">{{ PLAN_NAME[c.plan] ?? c.plan }}</span>
                  <span v-if="c.complimentary" class="rounded-full border border-violet/40 px-1.5 font-mono text-[10px] uppercase text-violet-soft">Comp</span>
                  <span v-if="c.customLimits" class="rounded-full border border-cyan/40 px-1.5 font-mono text-[10px] uppercase text-cyan">Custom</span>
                  <span v-if="c.staff" class="rounded-full border border-line px-1.5 font-mono text-[10px] uppercase text-ink-muted">Staff</span>
                  <span v-if="billingTone(c)" :class="['rounded-full border px-1.5 font-mono text-[10px] uppercase', billingTone(c).cls]">{{ billingTone(c).text }}</span>
                </div>
              </td>
              <td class="px-4 py-3 font-mono text-small text-ink-muted">{{ c.labels }} <span class="text-ink-faint">/ {{ c.labelLimit }}</span></td>
              <td class="px-4 py-3 text-small text-ink-muted">{{ c.signedInAt ? formatRelative(c.signedInAt) : 'Never' }}</td>
              <td class="px-4 py-3 text-small text-ink-muted">{{ formatDate(c.createdAt) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div v-if="result && rows.length < result.matched" class="mt-6 flex justify-center">
        <OpButton variant="secondary" :disabled="loadingMore" @click="load(true)">{{ loadingMore ? 'Loading…' : `Show more (${result.matched - rows.length} left)` }}</OpButton>
      </div>
    </template>
  </div>
</template>
