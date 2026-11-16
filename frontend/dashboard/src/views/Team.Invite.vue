<script setup>
// A team invite (link from email, /invite?token=…). Public: shows whose account and which role,
// then joining needs signing in with Google as the invited address. "Continue with Google" leaves
// the app; the router brings you back here afterwards (rememberAfterSignIn).
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import OpButton from '@ds/components/OpButton.vue';
import OpGoogleButton from '@ds/components/OpGoogleButton.vue';
import OpLogo from '@ds/components/OpLogo.vue';
import env from '@/helpers/Environment';
import { session, signOut } from '@/session';
import { rememberAfterSignIn } from '@/helpers/AfterSignIn';
import { switchAccount, ROLE_LABEL } from '@/team';
import * as TeamService from '@/services/service.team';

const route = useRoute();
const token = String(route.query.token ?? '');
const invite = ref(null); // { accountName, role, invitedEmail }
const loadError = ref('');
const accepting = ref(false);
const acceptError = ref('');

const ROLE_TEXT = {
  member: 'change everything except the team and billing',
  viewer: 'see everything, without changing anything',
};

onMounted(async () => {
  if (!token) { loadError.value = 'This invite link is incomplete. Open it again from the email.'; return; }
  try {
    invite.value = await TeamService.getInvite(token);
  } catch (e) {
    loadError.value = e.message || 'This invite has expired or was cancelled. Ask for a new one.';
  }
});

const me = computed(() => session.user);
const emailMatches = computed(() => !!me.value && !!invite.value && me.value.email?.toLowerCase() === invite.value.invitedEmail.toLowerCase());

const beforeGoogle = () => rememberAfterSignIn(route.fullPath);
const useAnotherAccount = async () => {
  beforeGoogle();
  await signOut();
  window.location.assign(env.googleSignInUrl);
};

const accept = async () => {
  accepting.value = true;
  acceptError.value = '';
  try {
    const joined = await TeamService.acceptInvite(token);
    switchAccount(joined.accountId);
  } catch (e) {
    acceptError.value = e.message || 'Could not join. Please try again.';
    accepting.value = false;
  }
};
</script>

<template>
  <div class="relative flex min-h-dvh items-center justify-center overflow-hidden px-4 py-12">
    <div class="pointer-events-none absolute -top-40 left-1/2 h-96 w-[640px] max-w-full -translate-x-1/2 rounded-full bg-cyan/10 blur-[120px]" aria-hidden="true" />
    <main class="relative w-full max-w-sm">
      <a :href="env.landingUrl" class="mb-8 flex justify-center" aria-label="Paprcraft home"><OpLogo /></a>

      <div class="rounded-sheet border border-line bg-surface-2 p-6 shadow-rim sm:p-8">
        <template v-if="loadError">
          <h1 class="text-h2 text-ink">Invite not available</h1>
          <p class="mt-2 text-body text-ink-muted">{{ loadError }}</p>
          <OpButton class="mt-6" block variant="secondary" href="/">Go to Paprcraft</OpButton>
        </template>

        <p v-else-if="!invite" class="text-body text-ink-muted">Loading your invite…</p>

        <template v-else>
          <p class="eyebrow">Team invite</p>
          <h1 class="mt-2 text-h2 text-ink">Join {{ invite.accountName }}</h1>
          <p class="mt-2 text-body text-ink-muted">
            You're invited as a <strong class="text-ink">{{ ROLE_LABEL[invite.role] }}</strong>: you'll be able to {{ ROLE_TEXT[invite.role] }}.
          </p>
          <p class="mt-3 rounded-control border border-line-soft bg-surface-1 px-3 py-2 text-small text-ink-muted">
            For <span class="font-mono text-ink">{{ invite.invitedEmail }}</span>
          </p>

          <!-- Signed in as the invited address: accept -->
          <template v-if="emailMatches">
            <p v-if="acceptError" role="alert" class="status-down mt-5 rounded-control border px-3 py-2 text-small">{{ acceptError }}</p>
            <OpButton class="mt-6" block size="lg" :disabled="accepting" @click="accept">{{ accepting ? 'Joining…' : `Join ${invite.accountName}` }}</OpButton>
            <p class="mt-3 text-center text-small text-ink-faint">Your own Paprcraft account stays as it is. Switch between accounts from the account menu.</p>
          </template>

          <!-- Signed in as someone else -->
          <template v-else-if="me">
            <p class="status-warn mt-5 rounded-control border px-3 py-2 text-small">
              You're signed in as {{ me.email }}. This invite is for {{ invite.invitedEmail }}.
            </p>
            <OpGoogleButton class="mt-4" size="lg" block :label="`Sign in as ${invite.invitedEmail}`" @click.prevent="useAnotherAccount" />
          </template>

          <!-- Not signed in -->
          <template v-else>
            <OpGoogleButton class="mt-6" size="lg" block label="Continue with Google" :href="env.googleSignInUrl" @click="beforeGoogle" />
            <p class="mt-3 text-center text-small text-ink-faint">Sign in with Google as {{ invite.invitedEmail }}. If you're new, this also creates your own free Paprcraft account.</p>
          </template>
        </template>
      </div>
    </main>
  </div>
</template>
