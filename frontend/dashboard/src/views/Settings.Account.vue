<script setup>
// Your account: who you're signed in as, and closing the account for good (backend
// service.accountClosure.js). Closing lists what goes with it, and the account's email has to be
// typed back before the button unlocks.
import { computed, ref } from 'vue';
import { RouterLink, useRouter } from 'vue-router';
import OpButton from '@ds/components/OpButton.vue';
import OpConfirmDialog from '@ds/components/OpConfirmDialog.vue';
import OpIcon from '@ds/components/OpIcon.vue';
import { session, signOut } from '@/session';
import * as AccountService from '@/services/service.account';
import { formatDate } from '@/helpers/Format';
import env from '@/helpers/Environment';

const router = useRouter();
const user = computed(() => session.user);
const name = computed(() => [user.value?.firstName, user.value?.lastName].filter(Boolean).join(' '));

const preview = ref(null); // GET /account-closure while the dialog is open
const opening = ref(false);
const closing = ref(false);
const typed = ref('');
const error = ref('');

const startClose = async () => {
  opening.value = true;
  error.value = '';
  try {
    typed.value = '';
    preview.value = await AccountService.getClosurePreview();
  } catch (e) {
    error.value = e.message || 'Could not load your account details.';
  }
  opening.value = false;
};
const cancel = () => { if (!closing.value) preview.value = null; };
const matches = computed(() => !!preview.value && typed.value.trim().toLowerCase() === String(preview.value.email).toLowerCase());

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const losing = computed(() => {
  const c = preview.value?.counts;
  if (!c) return [];
  return [c.labels && plural(c.labels, 'label'), c.templates && plural(c.templates, 'document template')].filter(Boolean);
});

const confirmClose = async () => {
  if (!matches.value) return;
  closing.value = true;
  error.value = '';
  try {
    await AccountService.closeAccount(typed.value.trim());
    await signOut();
    router.replace({ name: 'login', query: { error: 'account_closed' } });
  } catch (e) {
    error.value = e.message || 'Your account was not closed. Please try again.';
    closing.value = false;
  }
};
</script>

<template>
  <div class="mx-auto max-w-3xl">
    <p class="eyebrow">Settings</p>
    <h1 class="mt-2 text-h2 text-ink">Account</h1>

    <section class="mt-6 rounded-sheet border border-line bg-surface-2 p-5">
      <h2 class="text-h3 text-ink">Signed in as</h2>
      <dl class="mt-4 grid grid-cols-[7rem_minmax(0,1fr)] gap-y-2 text-body">
        <dt class="text-ink-faint">Name</dt><dd class="truncate text-ink">{{ name || '—' }}</dd>
        <dt class="text-ink-faint">Email</dt><dd class="truncate text-ink">{{ user?.email }}</dd>
        <dt class="text-ink-faint">Sign-in</dt><dd class="text-ink-muted">Google</dd>
      </dl>
      <p class="mt-4 text-small text-ink-faint">
        Your sign-ins and every change in your account are listed in
        <RouterLink :to="{ name: 'activity' }" class="text-cyan hover:underline">Activity</RouterLink>.
      </p>
    </section>

    <section class="mt-6 rounded-sheet border border-down/30 bg-surface-2 p-5">
      <div class="flex flex-wrap items-start justify-between gap-4">
        <div class="max-w-xl">
          <h2 class="text-h3 text-ink">Close account</h2>
          <p class="mt-1 text-small text-ink-muted">
            Permanently deletes your account and its data (labels, document templates, team, uploaded files). This can't be undone.
          </p>
        </div>
        <OpButton variant="destructive" size="sm" icon="trash" :disabled="opening" @click="startClose">{{ opening ? 'Loading…' : 'Close account' }}</OpButton>
      </div>
      <p v-if="error && !preview" role="alert" class="mt-3 text-small text-down">{{ error }}</p>
    </section>

    <OpConfirmDialog
      :open="!!preview"
      title="Close your Paprcraft account?"
      :confirm-label="closing ? 'Closing…' : 'Close my account'"
      cancel-label="Keep my account"
      icon="trash"
      tone="destructive"
      :confirm-disabled="!matches || closing || preview?.staff"
      @confirm="confirmClose"
      @cancel="cancel"
    >
      <template v-if="preview">
        <p v-if="preview.staff" class="status-warn mt-3 rounded-control border px-3 py-2 text-small">
          Staff accounts can't be closed here. Remove the staff role first.
        </p>
        <p class="mt-3 text-body font-medium text-ink">This happens straight away and can't be undone.</p>
        <ul class="mt-2 list-disc space-y-1 pl-5 text-small text-ink-muted">
          <li v-if="losing.length">Deleted, with all their history: {{ losing.join(', ') }}.</li>
          <li v-else>Your data is deleted.</li>
          <li v-if="preview.plan">Your {{ preview.plan }} plan is cancelled now<template v-if="preview.periodEnd"> (it was paid until {{ formatDate(preview.periodEnd) }})</template>. Unused time isn't refunded.</li>
          <li>Your Paprcraft account is deleted and you're signed out. Your Google account isn't affected.</li>
          <li>We keep a record of account activity for security, as our <a :href="`${env.landingUrl}/privacy.html`" target="_blank" rel="noopener" class="text-cyan hover:underline">Privacy Policy</a> describes.</li>
        </ul>
        <label class="mt-4 block text-small text-ink-muted" for="close-confirm">
          Type <strong class="font-mono text-ink">{{ preview.email }}</strong> to confirm
        </label>
        <input
          id="close-confirm"
          v-model="typed"
          type="email"
          autocomplete="off"
          spellcheck="false"
          :disabled="closing || preview.staff"
          class="mt-1.5 w-full rounded-control border border-line bg-surface-1 px-3 py-2 font-mono text-body text-ink focus:border-down/60 focus:outline-none"
          @keydown.enter.prevent="confirmClose"
        />
        <p v-if="error" role="alert" class="mt-3 text-small text-down">{{ error }}</p>
      </template>
    </OpConfirmDialog>
  </div>
</template>
