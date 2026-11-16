<script setup>
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import OpGoogleButton from '@ds/components/OpGoogleButton.vue';
import OpLogo from '@ds/components/OpLogo.vue';
import env from '@/helpers/Environment';

const route = useRoute();

// Set by the API's Google callback (controller.auth.js) or by an expired session.
const errors = {
  google_auth_failed: { tone: 'status-down', text: 'Google sign-in did not complete. Please try again.' },
  account_suspended: { tone: 'status-down', text: 'This account is suspended. Please contact Paprcraft support.' },
  account_closed: { tone: 'status-ok', text: "Your Paprcraft account is closed. We've emailed you a confirmation." },
  google_auth_cancelled: { tone: 'status-warn', text: 'You cancelled the Google sign-in screen.' },
  session_expired: { tone: 'status-warn', text: 'Your session has expired. Please sign in again.' },
};
const error = computed(() => errors[route.query.error]);
</script>

<template>
  <div class="relative flex min-h-dvh items-center justify-center overflow-hidden px-4 py-12">
    <div class="pointer-events-none absolute -top-40 left-1/2 h-96 w-[640px] max-w-full -translate-x-1/2 rounded-full bg-cyan/10 blur-[120px]" aria-hidden="true" />

    <main class="relative w-full max-w-sm">
      <a :href="env.landingUrl" class="mb-8 flex justify-center" aria-label="Paprcraft home"><OpLogo /></a>

      <div class="rounded-sheet border border-line bg-surface-2 p-6 shadow-rim sm:p-8">
        <h1 class="text-h2 text-ink">Sign in</h1>
        <p class="mt-2 text-body text-ink-muted">Use your Google account. If you're new, this creates your Paprcraft account.</p>

        <p v-if="error" role="alert" :class="['mt-5 rounded-control border px-3 py-2 text-small', error.tone]">{{ error.text }}</p>

        <OpGoogleButton class="mt-6" size="lg" block label="Continue with Google" :href="env.googleSignInUrl" />
      </div>

      <p class="mt-6 text-center text-small text-ink-faint">
        By continuing you agree to the
        <a :href="`${env.landingUrl}/terms.html`" class="text-ink-muted underline hover:text-ink">terms</a> and
        <a :href="`${env.landingUrl}/privacy.html`" class="text-ink-muted underline hover:text-ink">privacy policy</a>.
      </p>
    </main>
  </div>
</template>
