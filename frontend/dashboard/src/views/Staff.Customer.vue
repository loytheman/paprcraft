<script setup>
// Paprcraft staff: one customer. Read their plan, usage, team and activity; make the
// account complimentary (Pro), set custom limits (higher or lower, optionally until a
// date), suspend it, and keep internal notes. Every change needs a reason and is in the audit
// trail; the customer's own Activity shows it as "Paprcraft support".
import { computed, onMounted, reactive, ref } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import OpButton from '@ds/components/OpButton.vue';
import OpIcon from '@ds/components/OpIcon.vue';
import OpInput from '@ds/components/OpInput.vue';
import OpStatusBadge from '@ds/components/OpStatusBadge.vue';
import OpTextarea from '@ds/components/OpTextarea.vue';
import ActivityFeed from '@/components/ActivityFeed.vue';
import PageSkeleton from '@/components/PageSkeleton.vue';
import * as StaffService from '@/services/service.staff';
import { askConfirm } from '@/helpers/Confirm';
import { LIMIT_LABEL } from '@/helpers/Activity';
import { ROLE_LABEL } from '@/team';
import { formatDate, formatDateTime, formatRelative } from '@/helpers/Format';

const route = useRoute();
const id = route.params.id;
const PLAN_NAME = { free: 'Free', pro: 'Pro' };

const c = ref(null); // GET /staff/customers/:id
const loadError = ref('');
const notFound = ref(false);

const load = async () => {
  try {
    apply(await StaffService.getCustomer(id));
    loadError.value = '';
  } catch (e) {
    if (e.httpStatus === 404) notFound.value = true;
    else loadError.value = e.message || 'Could not load this customer.';
  }
};
// After any change: the new state, and the forms reset to it.
const apply = (data) => {
  c.value = data;
  resetLimitDrafts();
  notesDraft.value = data.account.notes ?? '';
};

const a = computed(() => c.value?.account);
// ---- Shared action state ----
const busy = ref('');
const notice = reactive({}); // section -> { ok, text }
const run = async (section, fn, okText) => {
  busy.value = section;
  notice[section] = null;
  try {
    const data = await fn();
    apply(data);
    notice[section] = { ok: true, text: typeof okText === 'function' ? okText(data) : okText };
    loadActivity();
    return true;
  } catch (e) {
    notice[section] = { ok: false, text: e.fieldErrors?.[0]?.message || e.message || 'That did not work.' };
    return false;
  } finally {
    busy.value = '';
  }
};

// ---- Complimentary ----
const compPlan = 'pro';
const compReason = ref('');
const makeComp = async () => {
  const ok = await run('comp', () => StaffService.setComplimentary(id, compPlan, compReason.value.trim()), `Now complimentary ${PLAN_NAME[compPlan]}.`);
  if (ok) compReason.value = '';
};
const endComp = async () => {
  const yes = await askConfirm({
    title: 'End the complimentary plan?',
    message: 'They move back to the plan they are on (Free unless billing says otherwise).',
    confirmLabel: 'End complimentary',
    icon: 'zap',
  });
  if (!yes) return;
  const ok = await run('comp', () => StaffService.setComplimentary(id, null, compReason.value.trim()), (d) => `Complimentary ended. Now on ${PLAN_NAME[d.account.plan]}.`);
  if (ok) compReason.value = '';
};

// ---- Limits ----
const drafts = reactive({}); // field -> { value: string, until: 'YYYY-MM-DD' }
const limitsReason = ref('');
const toDay = (iso) => (iso ? new Date(iso).toLocaleDateString('en-CA') : ''); // YYYY-MM-DD, local
const resetLimitDrafts = () => {
  for (const l of c.value?.limits ?? []) {
    drafts[l.field] = { value: l.override && l.live ? String(l.override.value) : '', until: l.override && l.live ? toDay(l.override.until) : '' };
  }
};
const original = (l) => ({ value: l.override && l.live ? String(l.override.value) : '', until: l.override && l.live ? toDay(l.override.until) : '' });
// Vue hands a number input's value back as a number (or '' when empty); compare as text. 0 counts.
const draftText = (field) => String(drafts[field]?.value ?? '').trim();
// { field: { value, until } | null } for what changed.
const limitChanges = computed(() => {
  const out = {};
  for (const l of c.value?.limits ?? []) {
    const d = drafts[l.field];
    const o = original(l);
    if (!d || (draftText(l.field) === o.value && d.until === o.until)) continue;
    if (draftText(l.field) === '') {
      if (l.override) out[l.field] = null; // back to the plan's
      continue;
    }
    // An end date means through the end of that day, local time.
    out[l.field] = { value: Number(d.value), until: d.until ? new Date(`${d.until}T23:59:59`).toISOString() : null };
  }
  return out;
});
const limitError = computed(() => {
  for (const [field, o] of Object.entries(limitChanges.value)) {
    if (!o) continue;
    const [min, max] = c.value.limits.find((l) => l.field === field).range;
    if (!Number.isInteger(o.value) || o.value < min || o.value > max) return `${LIMIT_LABEL[field]}: a whole number from ${min} to ${max}.`;
    if (o.until && Date.parse(o.until) <= Date.now()) return `${LIMIT_LABEL[field]}: the end date must be in the future.`;
  }
  return '';
});
const used = (field) => ({ labelLimit: c.value.usage.labels })[field];
// What saving would take away right now. Add a line per limit when your record types have counts.
const limitImpact = computed(() => []);
const saveLimits = async () => {
  if (limitImpact.value.length) {
    const yes = await askConfirm({ title: 'Lower these limits?', message: limitImpact.value.join(' '), confirmLabel: 'Save limits', icon: 'zap' });
    if (!yes) return;
  }
  const ok = await run('limits', () => StaffService.setLimits(id, limitChanges.value, limitsReason.value.trim()), 'Limits saved.');
  if (ok) limitsReason.value = '';
};
const clearLimit = (field) => { drafts[field] = { value: '', until: '' }; };

// ---- Suspend ----
const statusReason = ref('');
const toggleSuspend = async () => {
  const suspending = a.value.status !== 'suspended';
  if (suspending) {
    const yes = await askConfirm({
      title: `Suspend ${a.value.email}?`,
      message: 'They are signed out everywhere and cannot sign in until you unsuspend. Nothing is deleted.',
      confirmLabel: 'Suspend account',
      icon: 'lock',
    });
    if (!yes) return;
  }
  const ok = await run('status', () => StaffService.setStatus(id, suspending ? 'suspended' : 'normal', statusReason.value.trim()), (d) => (suspending ? `Suspended. Ended ${d.sessionsEnded} session${d.sessionsEnded === 1 ? '' : 's'}.` : 'Unsuspended.'));
  if (ok) statusReason.value = '';
};

// ---- Close account ----
const router = useRouter();
const closeReason = ref('');
const closeCustomer = async () => {
  busy.value = 'close';
  notice.close = null;
  try {
    const p = await StaffService.getClosurePreview(id);
    const lost = `${p.counts.labels} labels`;
    busy.value = '';
    const yes = await askConfirm({
      title: `Close ${p.email}'s account?`,
      message: `Deletes ${lost}, and the account itself.${p.plan ? ` Their ${p.plan} plan is cancelled now with no refund.` : ''} They're signed out and emailed. This can't be undone.`,
      confirmLabel: 'Close account',
      cancelLabel: 'Keep it',
    });
    if (!yes) return;
    busy.value = 'close';
    await StaffService.closeAccount(id, closeReason.value.trim());
    router.replace({ name: 'staff-customers', query: { closed: p.email } });
  } catch (e) {
    notice.close = { ok: false, text: e.message || 'The account was not closed.' };
  }
  busy.value = '';
};

// ---- Notes ----
const notesDraft = ref('');
const saveNotes = () => run('notes', () => StaffService.setNotes(id, notesDraft.value), 'Notes saved.');

// ---- Activity ----
const activity = ref({ rows: [], next: null, loaded: false, loading: false });
const loadActivity = async (more = false) => {
  activity.value.loading = true;
  try {
    const page = await StaffService.getActivity(id, more ? activity.value.next : null);
    activity.value = { rows: more ? [...activity.value.rows, ...page.results] : page.results, next: page.next, loaded: true, loading: false };
  } catch {
    activity.value = { ...activity.value, loaded: true, loading: false };
  }
};

onMounted(() => {
  load();
  loadActivity();
});
</script>

<template>
  <div>
    <RouterLink :to="{ name: 'staff-customers' }" class="inline-flex items-center gap-1.5 text-small text-ink-muted hover:text-ink"><OpIcon name="arrow-left" :size="14" /> Customers</RouterLink>

    <p v-if="notFound" class="mt-6 text-body text-ink-muted">No such customer.</p>
    <p v-else-if="loadError" role="alert" class="status-down mt-6 rounded-control border px-3 py-2 text-small">{{ loadError }}</p>
    <PageSkeleton v-else-if="!c" kind="detail" class="mt-4" />

    <template v-else>
      <!-- Header -->
      <div class="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div class="min-w-0">
          <p class="eyebrow !text-violet-soft">Staff · Customer</p>
          <h1 class="mt-2 truncate text-h2 text-ink">{{ a.name || a.email }}</h1>
          <p class="mt-1 text-body text-ink-muted"><span v-if="a.name">{{ a.email }} · </span>joined {{ formatDate(a.createdAt) }} · last sign-in {{ a.signedInAt ? formatRelative(a.signedInAt) : 'never' }}</p>
          <p class="mt-1 font-mono text-small text-ink-faint">{{ a.id }}</p>
        </div>
        <div class="flex flex-wrap gap-2">
          <span class="rounded-full border border-line px-2.5 py-0.5 text-small text-ink">{{ PLAN_NAME[a.plan] }}</span>
          <span v-if="a.complimentary" class="rounded-full border border-violet/40 px-2.5 py-0.5 text-small text-violet-soft">Complimentary</span>
          <span v-if="a.customLimits" class="rounded-full border border-cyan/40 px-2.5 py-0.5 text-small text-cyan">Custom limits</span>
          <span v-if="a.status === 'suspended'" class="status-down rounded-full border px-2.5 py-0.5 text-small">Suspended</span>
          <span v-if="a.staff" class="rounded-full border border-line px-2.5 py-0.5 text-small text-ink-muted">Staff</span>
        </div>
      </div>

      <p v-if="a.lastStaffAction" class="mt-4 text-small text-ink-faint">
        Last staff change: <span class="text-ink-muted">{{ a.lastStaffAction.action }}</span> by {{ a.lastStaffAction.by || 'staff' }}, {{ formatDateTime(a.lastStaffAction.at) }}. Reason: <span class="text-ink-muted">{{ a.lastStaffAction.reason }}</span>
      </p>

      <div class="mt-6 grid gap-6 lg:grid-cols-2">
        <!-- Plan -->
        <section class="rounded-sheet border border-line bg-surface-2 p-5">
          <h2 class="text-h3 text-ink">Plan</h2>
          <dl class="mt-4 grid grid-cols-[8rem_minmax(0,1fr)] gap-y-2 text-small">
            <dt class="text-ink-faint">Plan</dt><dd class="text-ink">{{ PLAN_NAME[a.plan] }}</dd>
            <dt class="text-ink-faint">Billing</dt><dd class="text-ink-muted">{{ a.complimentary ? 'Complimentary, never billed' : 'No billing set up yet' }}</dd>
          </dl>
        </section>

        <!-- Complimentary -->
        <section class="rounded-sheet border border-line bg-surface-2 p-5">
          <h2 class="text-h3 text-ink">Complimentary plan</h2>
          <p class="mt-1 text-small text-ink-muted">
            <template v-if="a.complimentary">On complimentary <span class="text-ink">{{ PLAN_NAME[a.compPlan] }}</span>, never billed.</template>
            <template v-else>Give Pro without charge.</template>
          </p>
          <form class="mt-4 grid gap-3" @submit.prevent="makeComp">
            <OpInput v-model="compReason" label="Reason" placeholder="e.g. Partner account, agreed with Jane on 3 Nov" required />
            <p v-if="notice.comp" role="status" :class="['text-small', notice.comp.ok ? 'text-ok' : 'text-down']">{{ notice.comp.text }}</p>
            <div class="flex flex-wrap gap-2">
              <OpButton type="submit" size="sm" :disabled="!!busy || compReason.trim().length < 3 || a.complimentary">
                Make complimentary
              </OpButton>
              <OpButton v-if="a.complimentary" type="button" size="sm" variant="secondary" :disabled="!!busy || compReason.trim().length < 3" @click="endComp">End complimentary</OpButton>
            </div>
          </form>
        </section>
      </div>

      <!-- Limits -->
      <section class="mt-6 rounded-sheet border border-line bg-surface-2 p-5">
        <h2 class="text-h3 text-ink">Limits</h2>
        <p class="mt-1 text-small text-ink-muted">Set a number to override the plan for this account (higher or lower), optionally until a date. Leave it empty for the plan's. Custom limits stay when the plan changes.</p>
        <div class="mt-4 overflow-x-auto">
          <table class="w-full min-w-[40rem] text-left text-small">
            <thead>
              <tr class="font-mono text-label uppercase text-ink-faint">
                <th class="pb-2 font-medium">Limit</th>
                <th class="pb-2 font-medium">In use</th>
                <th class="pb-2 font-medium">Plan</th>
                <th class="pb-2 font-medium">Custom</th>
                <th class="pb-2 font-medium">Until (optional)</th>
                <th class="pb-2" />
              </tr>
            </thead>
            <tbody>
              <tr v-for="l in c.limits" :key="l.field" class="border-t border-line-faint">
                <td class="py-2 pr-3 text-ink">{{ LIMIT_LABEL[l.field] }}<span v-if="l.override && !l.live" class="ml-1.5 text-ink-faint">(ended)</span></td>
                <td class="py-2 pr-3 font-mono text-ink-muted">{{ used(l.field) ?? '—' }}</td>
                <td class="py-2 pr-3 font-mono text-ink-faint">{{ l.plan }}</td>
                <td class="py-2 pr-3">
                  <input
                    v-model="drafts[l.field].value"
                    type="number"
                    inputmode="numeric"
                    :min="l.range[0]"
                    :max="l.range[1]"
                    :placeholder="String(l.plan)"
                    :aria-label="`Custom ${LIMIT_LABEL[l.field]}`"
                    class="w-24 rounded-control border border-line bg-surface-1 px-2 py-1 font-mono text-ink placeholder:text-ink-faint focus:border-cyan/60 focus:outline-none"
                  />
                </td>
                <td class="py-2 pr-3">
                  <input v-model="drafts[l.field].until" type="date" :disabled="!draftText(l.field)" :aria-label="`${LIMIT_LABEL[l.field]} until`" class="rounded-control border border-line bg-surface-1 px-2 py-1 text-ink focus:border-cyan/60 focus:outline-none disabled:opacity-40" />
                </td>
                <td class="py-2 text-right">
                  <button v-if="draftText(l.field)" type="button" class="text-small text-ink-muted hover:text-ink" @click="clearLimit(l.field)">Plan's</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <form v-if="Object.keys(limitChanges).length" class="mt-4 grid gap-3 border-t border-line-soft pt-4" @submit.prevent="saveLimits">
          <ul v-if="limitImpact.length" class="status-warn rounded-control border px-3 py-2 text-small">
            <li v-for="line in limitImpact" :key="line">{{ line }}</li>
          </ul>
          <OpInput v-model="limitsReason" label="Reason" placeholder="e.g. Agency trial, 40 labels for 3 months" required :error="limitError" />
          <div class="flex flex-wrap gap-2">
            <OpButton type="submit" size="sm" :disabled="!!busy || !!limitError || limitsReason.trim().length < 3">{{ busy === 'limits' ? 'Saving…' : 'Save limits' }}</OpButton>
            <OpButton type="button" size="sm" variant="secondary" :disabled="!!busy" @click="resetLimitDrafts">Undo changes</OpButton>
          </div>
        </form>
        <p v-if="notice.limits" role="status" :class="['mt-3 text-small', notice.limits.ok ? 'text-ok' : 'text-down']">{{ notice.limits.text }}</p>
      </section>

      <div class="mt-6 grid gap-6 lg:grid-cols-2">
        <!-- Status -->
        <section class="rounded-sheet border border-line bg-surface-2 p-5">
          <h2 class="text-h3 text-ink">Account status</h2>
          <p class="mt-1 text-small text-ink-muted">
            <template v-if="a.status === 'suspended'">Suspended: signed out and cannot sign in.</template>
            <template v-else>Active. Suspending signs them out and blocks sign-in; nothing is deleted.</template>
          </p>
          <form class="mt-4 grid gap-3" @submit.prevent="toggleSuspend">
            <OpInput v-model="statusReason" label="Reason" :placeholder="a.status === 'suspended' ? 'e.g. Payment sorted out' : 'e.g. Abuse report, ticket 1234'" required />
            <p v-if="notice.status" role="status" :class="['text-small', notice.status.ok ? 'text-ok' : 'text-down']">{{ notice.status.text }}</p>
            <div>
              <OpButton type="submit" size="sm" :variant="a.status === 'suspended' ? 'primary' : 'destructive'" :disabled="!!busy || statusReason.trim().length < 3">{{ a.status === 'suspended' ? 'Unsuspend' : 'Suspend account' }}</OpButton>
            </div>
          </form>
        </section>

        <!-- Notes -->
        <section class="rounded-sheet border border-line bg-surface-2 p-5">
          <h2 class="text-h3 text-ink">Staff notes</h2>
          <p class="mt-1 text-small text-ink-muted">Only Paprcraft staff see these.</p>
          <form class="mt-4 grid gap-3" @submit.prevent="saveNotes">
            <OpTextarea v-model="notesDraft" label="Notes" :rows="4" :maxlength="5000" />
            <p v-if="notice.notes" role="status" :class="['text-small', notice.notes.ok ? 'text-ok' : 'text-down']">{{ notice.notes.text }}</p>
            <div><OpButton type="submit" size="sm" variant="secondary" :disabled="!!busy || notesDraft === (a.notes ?? '')">Save notes</OpButton></div>
          </form>
        </section>
      </div>

      <!-- Close account -->
      <section class="mt-6 rounded-sheet border border-down/30 bg-surface-2 p-5">
        <h2 class="text-h3 text-ink">Close account</h2>
        <p class="mt-1 text-small text-ink-muted">Deletes their data (labels, team, uploads), signs them out and deletes the account. They're emailed a confirmation. This can't be undone.</p>
        <form class="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end" @submit.prevent="closeCustomer">
          <OpInput v-model="closeReason" label="Reason" placeholder="e.g. Customer asked by email, ticket 1234" required />
          <OpButton type="submit" variant="destructive" :disabled="!!busy || closeReason.trim().length < 3 || a.staff">{{ busy === 'close' ? 'Closing…' : 'Close account' }}</OpButton>
        </form>
        <p v-if="a.staff" class="mt-2 text-small text-ink-faint">This is a staff account. Remove the staff role first (src/scripts/staff-role.js).</p>
        <p v-if="notice.close" role="status" :class="['mt-2 text-small', notice.close.ok ? 'text-ok' : 'text-down']">{{ notice.close.text }}</p>
      </section>

      <!-- Team -->
      <section class="mt-6 rounded-sheet border border-line bg-surface-2 p-5">
        <h2 class="text-h3 text-ink">Team <span v-if="c.team.available" class="font-mono text-small text-ink-faint">{{ c.team.seats.used }} / {{ c.team.seats.limit }} people</span></h2>
        <p v-if="!c.team.available" class="mt-1 text-small text-ink-faint">Teams need Pro.<template v-if="c.team.members.length"> The people below keep their place but can't use the account until it's on Pro again.</template></p>
        <ul v-if="c.team.members.length" class="mt-3 divide-y divide-line-faint">
          <li v-for="m in c.team.members" :key="m.id" class="flex flex-wrap items-center justify-between gap-2 py-2.5">
            <div class="min-w-0">
              <p class="truncate text-body text-ink">{{ m.name || m.email }}</p>
              <p class="truncate text-small text-ink-faint"><template v-if="m.name">{{ m.email }} · </template>{{ m.status === 'invited' ? `invited ${formatDate(m.invitedAt)}` : `joined ${formatDate(m.joinedAt)}` }}</p>
            </div>
            <div class="flex items-center gap-2">
              <OpStatusBadge status="info">{{ ROLE_LABEL[m.role] }}</OpStatusBadge>
              <OpStatusBadge v-if="m.status === 'invited'" status="warn">Invited</OpStatusBadge>
            </div>
          </li>
        </ul>
        <p v-else class="mt-2 text-small text-ink-faint">No team members.</p>

        <h3 class="mt-5 text-body font-medium text-ink">On other teams</h3>
        <ul v-if="c.memberships.length" class="mt-2 divide-y divide-line-faint">
          <li v-for="m in c.memberships" :key="m.accountId" class="flex flex-wrap items-center justify-between gap-2 py-2.5">
            <div class="min-w-0">
              <a :href="`/staff/customers/${m.accountId}`" class="truncate text-body text-cyan hover:underline">{{ m.name }}</a>
              <p class="truncate text-small text-ink-faint">{{ m.email }} · {{ m.status === 'invited' ? `invited ${formatDate(m.invitedAt)}` : `joined ${formatDate(m.joinedAt)}` }}</p>
            </div>
            <div class="flex items-center gap-2">
              <OpStatusBadge status="info">{{ ROLE_LABEL[m.role] }}</OpStatusBadge>
              <OpStatusBadge v-if="m.status === 'invited'" status="warn">Invited</OpStatusBadge>
              <OpStatusBadge v-else-if="!m.available" status="down">Paused</OpStatusBadge>
            </div>
          </li>
        </ul>
        <p v-else class="mt-2 text-small text-ink-faint">Not on anyone else's team.</p>
      </section>

      <!-- Activity -->
      <section class="mt-6">
        <h2 class="text-h3 text-ink">Activity</h2>
        <p class="mt-1 text-small text-ink-muted">Everything in this account, staff changes included (the customer sees those as "Paprcraft support").</p>
        <p v-if="!activity.loaded" class="mt-4 text-small text-ink-faint">Loading…</p>
        <p v-else-if="!activity.rows.length" class="mt-4 text-small text-ink-muted">Nothing recorded yet.</p>
        <ActivityFeed v-else class="mt-4" :rows="activity.rows" />
        <div v-if="activity.next" class="mt-4 flex justify-center">
          <OpButton size="sm" variant="secondary" :disabled="activity.loading" @click="loadActivity(true)">{{ activity.loading ? 'Loading…' : 'Show older' }}</OpButton>
        </div>
      </section>
    </template>
  </div>
</template>
