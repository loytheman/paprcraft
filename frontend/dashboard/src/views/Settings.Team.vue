<script setup>
// The team of the account you're in (backend service.team.js). The owner invites people (Pro
// only, 5 seats including the owner), changes their role and removes them; members and viewers
// see who's on the team and can leave it.
import { computed, onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';
import OpButton from '@ds/components/OpButton.vue';
import RowMenu from '@/components/RowMenu.vue';
import OpIcon from '@ds/components/OpIcon.vue';
import OpInput from '@ds/components/OpInput.vue';
import OpStatusBadge from '@ds/components/OpStatusBadge.vue';
import PageSkeleton from '@/components/PageSkeleton.vue';
import * as TeamService from '@/services/service.team';
import { askConfirm } from '@/helpers/Confirm';
import { formatDate } from '@/helpers/Format';
import { activeMembership, isOwner, ROLE_LABEL, switchAccount } from '@/team';

const ROLES = [
  { value: 'member', label: 'Member', hint: 'Can change everything except the team and billing.' },
  { value: 'viewer', label: 'Viewer', hint: 'Sees everything, changes nothing.' },
];

const team = ref(null);
const loadError = ref('');
const busy = ref('');
const notice = ref(null); // { ok, text }

const load = async () => {
  try {
    team.value = await TeamService.getTeam();
    loadError.value = '';
  } catch (e) {
    loadError.value = e.message || 'Could not load the team.';
  }
};
onMounted(load);

const seatsLeft = computed(() => (team.value ? team.value.seats.limit - team.value.seats.used : 0));
const canInvite = computed(() => isOwner.value && team.value?.available && seatsLeft.value > 0);

const run = async (what, fn, ok) => {
  busy.value = what;
  notice.value = null;
  try {
    team.value = await fn();
    notice.value = ok ? { ok: true, text: ok } : null;
    return true;
  } catch (e) {
    notice.value = { ok: false, text: e.fieldErrors?.[0]?.message || e.message || 'That did not work.' };
    return false;
  } finally {
    busy.value = '';
  }
};

// Invite
const form = ref({ email: '', role: 'member' });
const invite = async () => {
  const email = form.value.email.trim();
  if (await run('invite', () => TeamService.invite(email, form.value.role), `Invite sent to ${email}.`)) form.value.email = '';
};

const resend = (m) => run(`resend-${m.id}`, () => TeamService.resendInvite(m.id), `A new invite is on its way to ${m.email}.`);
const changeRole = (m, role) => run(`role-${m.id}`, () => TeamService.changeRole(m.id, role), `${m.name || m.email} is now a ${ROLE_LABEL[role]}.`);
const remove = async (m) => {
  const invited = m.status === 'invited';
  const ok = await askConfirm({
    title: invited ? `Cancel the invite to ${m.email}?` : `Remove ${m.name || m.email}?`,
    message: invited ? 'The invite link stops working.' : "They lose access to this account straight away and we'll email them. Their own Paprcraft account isn't affected.",
    confirmLabel: invited ? 'Cancel invite' : 'Remove',
    cancelLabel: 'Keep',
  });
  if (ok) run(`remove-${m.id}`, () => TeamService.removeMember(m.id), invited ? 'Invite cancelled.' : `${m.name || m.email} was removed.`);
};

// Leave (members and viewers)
const leave = async () => {
  const ok = await askConfirm({
    title: `Leave ${activeMembership.value?.name}'s account?`,
    message: "You'll lose access straight away. The owner would need to invite you again.",
    confirmLabel: 'Leave team',
    cancelLabel: 'Stay',
  });
  if (!ok) return;
  busy.value = 'leave';
  try {
    await TeamService.leave(activeMembership.value.accountId);
    switchAccount(null);
  } catch (e) {
    notice.value = { ok: false, text: e.message || 'Could not leave the team.' };
    busy.value = '';
  }
};
</script>

<template>
  <div class="mx-auto max-w-3xl">
    <p class="eyebrow">Settings</p>
    <div class="mt-2 flex flex-wrap items-end justify-between gap-3">
      <h1 class="text-h2 text-ink">Team</h1>
      <span v-if="team?.available" class="font-mono text-small text-ink-faint" :title="`Your plan includes ${team.seats.limit} people, the owner included`">{{ team.seats.used }} / {{ team.seats.limit }} people</span>
    </div>
    <p class="mt-2 max-w-2xl text-body text-ink-muted">People who can work in this account. Their changes show in Activity under their name.</p>

    <p v-if="loadError" role="alert" class="status-down mt-6 rounded-control border px-3 py-2 text-small">{{ loadError }}</p>
    <PageSkeleton v-else-if="!team" kind="settings" class="mt-6" />

    <template v-else>
      <!-- Teams need Pro -->
      <section v-if="!team.available && isOwner" class="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-sheet border border-primary/30 bg-primary/5 p-5">
        <div class="max-w-lg">
          <h2 class="text-h3 text-ink">Team members are on Pro</h2>
          <p class="mt-1 text-small text-ink-muted">Invite up to 4 people, so 5 including you, as Members or Viewers. (Billing isn't set up yet: staff can switch an account to Pro.)<template v-if="team.members.length"> Your current team keeps its place, but can't use the account until you're on Pro again.</template></p>
        </div>
      </section>

      <p v-if="notice" role="status" :class="['mt-6 rounded-control border px-3 py-2 text-small', notice.ok ? 'status-ok' : 'status-down']">{{ notice.text }}</p>

      <!-- Invite -->
      <form v-if="isOwner && team.available" class="mt-6 rounded-sheet border border-line bg-surface-2 p-5" @submit.prevent="invite">
        <h2 class="text-h3 text-ink">Invite someone</h2>
        <p class="mt-1 text-small text-ink-muted">They'll get an email and join by signing in with Google as that address. The link works for 7 days.</p>
        <template v-if="canInvite">
          <div class="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
            <OpInput v-model="form.email" label="Email address" type="email" placeholder="sam@example.com" required />
            <OpButton type="submit" icon="send" :disabled="!!busy || !form.email.trim()">{{ busy === 'invite' ? 'Sending…' : 'Send invite' }}</OpButton>
          </div>
          <div class="mt-3 grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Role">
            <button
              v-for="r in ROLES"
              :key="r.value"
              type="button"
              role="radio"
              :aria-checked="form.role === r.value"
              :class="['rounded-control border px-3 py-2 text-left transition-colors', form.role === r.value ? 'border-primary bg-primary/10' : 'border-line hover:border-line-strong']"
              @click="form.role = r.value"
            >
              <span class="block text-body text-ink">{{ r.label }}</span>
              <span class="block text-small text-ink-muted">{{ r.hint }}</span>
            </button>
          </div>
        </template>
        <p v-else class="mt-3 text-small text-ink-muted">All {{ team.seats.limit }} places are taken. Remove someone or cancel an invite to invite someone else.</p>
      </form>

      <!-- The team -->
      <section class="mt-6 rounded-sheet border border-line bg-surface-2">
        <ul class="divide-y divide-line-faint">
          <li class="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
            <div class="min-w-0">
              <p class="truncate text-body text-ink">{{ team.owner.name }}</p>
              <p class="truncate text-small text-ink-faint">{{ team.owner.email }}</p>
            </div>
            <OpStatusBadge status="ok">Owner</OpStatusBadge>
          </li>
          <li v-for="m in team.members" :key="m.id" class="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
            <div class="min-w-0">
              <p class="truncate text-body text-ink">{{ m.name || m.email }}</p>
              <p class="truncate text-small text-ink-faint">
                <template v-if="m.name">{{ m.email }} · </template>
                {{ m.status === 'invited' ? `Invited ${formatDate(m.invitedAt)}, not joined yet` : `Joined ${formatDate(m.joinedAt)}` }}
              </p>
            </div>
            <div class="flex flex-wrap items-center gap-2">
              <select
                v-if="isOwner"
                :value="m.role"
                :disabled="!!busy"
                :aria-label="`Role for ${m.email}`"
                class="rounded-control border border-line bg-surface-1 px-2.5 py-1.5 text-small text-ink focus:border-primary/60 focus:outline-none"
                @change="changeRole(m, $event.target.value)"
              >
                <option v-for="r in ROLES" :key="r.value" :value="r.value" class="bg-surface-2">{{ r.label }}</option>
              </select>
              <OpStatusBadge v-else status="info">{{ ROLE_LABEL[m.role] }}</OpStatusBadge>
              <OpStatusBadge v-if="m.status === 'invited'" status="warn">Invited</OpStatusBadge>
              <span v-if="busy === `resend-${m.id}`" class="text-small text-ink-faint">Sending…</span>
              <RowMenu
                v-if="isOwner"
                :label="`More actions for ${m.email}`"
                :items="[
                  ...(m.status === 'invited' ? [{ label: 'Resend invite', icon: 'send', disabled: !!busy, action: () => resend(m) }] : []),
                  { label: m.status === 'invited' ? 'Cancel invite' : 'Remove from team', icon: 'trash', danger: true, disabled: !!busy, action: () => remove(m) },
                ]"
              />
            </div>
          </li>
        </ul>
        <p v-if="!team.members.length" class="border-t border-line-faint px-5 py-4 text-small text-ink-faint">{{ isOwner ? 'No one else yet.' : '' }}</p>
      </section>

      <!-- Members and viewers can leave -->
      <section v-if="!isOwner" class="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-sheet border border-line bg-surface-2 p-5">
        <p class="text-small text-ink-muted">You're a <strong class="text-ink">{{ ROLE_LABEL[activeMembership?.role] }}</strong> here. Leaving removes your access; your own account isn't affected.</p>
        <OpButton variant="secondary" size="sm" icon="log-out" :disabled="!!busy" @click="leave">{{ busy === 'leave' ? 'Leaving…' : 'Leave this team' }}</OpButton>
      </section>
    </template>
  </div>
</template>
