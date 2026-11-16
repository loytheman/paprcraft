<script setup>
// The signed-in layout: main nav and an account menu (team, labels, activity, account, sign out).
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router';
import OpIcon from '@ds/components/OpIcon.vue';
import OpLogo from '@ds/components/OpLogo.vue';
import { isStaff, session, signOut } from '@/session';
import { activeMembership, isOwner, memberships, role, ROLE_LABEL, switchAccount } from '@/team';

const route = useRoute();
const router = useRouter();
const signingOut = ref(false);

const user = computed(() => session.user);
const staff = computed(() => isStaff());
const fullName = computed(() => `${user.value?.firstName ?? ''} ${user.value?.lastName ?? ''}`.trim());
const initials = computed(() => (fullName.value || user.value?.email || '?').split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase());

// Account menu
const menuOpen = ref(false);
const menuRoot = ref(null);
const closeMenu = () => { menuOpen.value = false; };
const onDocClick = (e) => { if (menuOpen.value && !menuRoot.value?.contains(e.target)) closeMenu(); };
const onKey = (e) => { if (e.key === 'Escape') closeMenu(); };
onMounted(() => { document.addEventListener('click', onDocClick); document.addEventListener('keydown', onKey); });
onBeforeUnmount(() => { document.removeEventListener('click', onDocClick); document.removeEventListener('keydown', onKey); });
watch(() => route.fullPath, closeMenu);

const onSignOut = async () => {
  signingOut.value = true;
  await signOut();
  router.replace({ name: 'login' });
};
</script>

<template>
  <div class="min-h-dvh">
    <header class="sticky top-0 z-40 border-b border-line-soft bg-surface-1/90 backdrop-blur-md">
      <div class="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3 md:px-8">
        <div class="contents md:flex md:items-center md:gap-6">
          <RouterLink :to="{ name: 'home' }" aria-label="Home"><OpLogo /></RouterLink>
          <nav class="order-last flex w-full items-center gap-4 text-body md:order-none md:w-auto" aria-label="Main">
            <RouterLink :to="{ name: 'home' }" class="text-ink-muted hover:text-ink" exact-active-class="!text-ink">Home</RouterLink>
            <RouterLink :to="{ name: 'templates' }" class="text-ink-muted hover:text-ink" active-class="!text-ink">Templates</RouterLink>
            <RouterLink :to="{ name: 'forms' }" class="text-ink-muted hover:text-ink" active-class="!text-ink">Forms</RouterLink>
            <RouterLink :to="{ name: 'submissions' }" class="text-ink-muted hover:text-ink" active-class="!text-ink">Submissions</RouterLink>
            <!-- Add your main nav links here. -->
          </nav>
        </div>

        <div class="flex items-center gap-2">
          <div ref="menuRoot" class="relative">
            <button
              type="button"
              class="flex items-center gap-2 rounded-full border border-transparent py-1 pr-2 pl-1 transition-colors hover:border-line"
              :class="menuOpen && '!border-line bg-ink/4'"
              aria-haspopup="menu"
              :aria-expanded="menuOpen"
              aria-label="Account menu"
              @click="menuOpen = !menuOpen"
            >
              <span class="flex size-8 items-center justify-center rounded-full border border-line bg-surface-3 font-mono text-small text-primary-text" aria-hidden="true">{{ initials }}</span>
              <span class="hidden max-w-40 truncate text-body text-ink sm:inline">{{ user?.firstName || fullName || user?.email }}</span>
              <OpIcon name="chevron-down" :size="14" class="text-ink-faint transition-transform" :class="menuOpen && 'rotate-180'" />
            </button>

            <div
              v-if="menuOpen"
              role="menu"
              class="absolute right-0 mt-2 w-72 overflow-hidden rounded-card border border-line bg-surface-3 shadow-rim"
            >
              <div class="border-b border-line-soft px-4 py-3">
                <p class="truncate text-body text-ink">{{ fullName || user?.email }}</p>
                <p v-if="fullName" class="truncate text-small text-ink-faint">{{ user?.email }}</p>
              </div>
              <!-- Accounts: yours, and the teams you're on (only when you're on one). -->
              <div v-if="memberships.length" class="border-b border-line-soft py-1.5">
                <p class="px-4 pt-1 pb-1.5 text-label uppercase text-ink-faint">Accounts</p>
                <button type="button" role="menuitemradio" :aria-checked="!activeMembership" class="flex w-full items-center justify-between gap-3 px-4 py-2 text-left text-body hover:bg-ink/4" :class="!activeMembership ? 'text-ink' : 'text-ink-muted'" @click="switchAccount(null)">
                  <span class="truncate">Your account</span>
                  <OpIcon v-if="!activeMembership" name="check" :size="14" class="shrink-0 text-primary-text" />
                </button>
                <button
                  v-for="m in memberships"
                  :key="m.accountId"
                  type="button"
                  role="menuitemradio"
                  :aria-checked="activeMembership?.accountId === m.accountId"
                  :disabled="!m.available"
                  :title="m.available ? '' : 'Paused: this account is no longer on Pro'"
                  class="flex w-full items-center justify-between gap-3 px-4 py-2 text-left text-body hover:bg-ink/4 disabled:cursor-not-allowed disabled:opacity-50"
                  :class="activeMembership?.accountId === m.accountId ? 'text-ink' : 'text-ink-muted'"
                  @click="switchAccount(m.accountId)"
                >
                  <span class="min-w-0 truncate">{{ m.name }}</span>
                  <span class="flex shrink-0 items-center gap-1.5">
                    <span class="rounded-full border border-line px-2 font-mono text-[10px] uppercase leading-5 text-ink-muted">{{ m.available ? ROLE_LABEL[m.role] : 'Paused' }}</span>
                    <OpIcon v-if="activeMembership?.accountId === m.accountId" name="check" :size="14" class="text-primary-text" />
                  </span>
                </button>
              </div>
              <RouterLink :to="{ name: 'team' }" role="menuitem" class="flex items-center gap-2.5 px-4 py-2.5 text-body text-ink-muted hover:bg-ink/4 hover:text-ink">
                <OpIcon name="users" :size="16" /> Team
              </RouterLink>
              <RouterLink :to="{ name: 'labels' }" role="menuitem" class="flex items-center gap-2.5 px-4 py-2.5 text-body text-ink-muted hover:bg-ink/4 hover:text-ink">
                <OpIcon name="tag" :size="16" /> Labels
              </RouterLink>
              <RouterLink :to="{ name: 'activity' }" role="menuitem" class="flex items-center gap-2.5 px-4 py-2.5 text-body text-ink-muted hover:bg-ink/4 hover:text-ink">
                <OpIcon name="activity" :size="16" /> Activity
              </RouterLink>
              <RouterLink v-if="isOwner" :to="{ name: 'api-key' }" role="menuitem" class="flex items-center gap-2.5 px-4 py-2.5 text-body text-ink-muted hover:bg-ink/4 hover:text-ink">
                <OpIcon name="lock" :size="16" /> API key
              </RouterLink>
              <RouterLink :to="{ name: 'account' }" role="menuitem" class="flex items-center gap-2.5 px-4 py-2.5 text-body text-ink-muted hover:bg-ink/4 hover:text-ink">
                <OpIcon name="lock" :size="16" /> Your account
              </RouterLink>
              <RouterLink v-if="staff" :to="{ name: 'staff-customers' }" role="menuitem" class="flex items-center gap-2.5 border-t border-line-soft px-4 py-2.5 text-body text-tertiary hover:bg-ink/4 hover:text-ink">
                <OpIcon name="shield" :size="16" /> Staff: customers
              </RouterLink>
              <RouterLink v-if="staff" :to="{ name: 'staff-templates' }" role="menuitem" class="flex items-center gap-2.5 px-4 py-2.5 text-body text-tertiary hover:bg-ink/4 hover:text-ink">
                <OpIcon name="layout" :size="16" /> Staff: master templates
              </RouterLink>
              <RouterLink v-if="staff" :to="{ name: 'staff-forms' }" role="menuitem" class="flex items-center gap-2.5 px-4 py-2.5 text-body text-tertiary hover:bg-ink/4 hover:text-ink">
                <OpIcon name="layout" :size="16" /> Staff: master forms
              </RouterLink>
              <button type="button" role="menuitem" class="flex w-full items-center gap-2.5 border-t border-line-soft px-4 py-2.5 text-left text-body text-ink-muted hover:bg-ink/4 hover:text-ink disabled:opacity-50" :disabled="signingOut" @click="onSignOut">
                <OpIcon name="log-out" :size="16" /> {{ signingOut ? 'Signing out…' : 'Sign out' }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </header>

    <!-- Working in someone else's account (a team): always visible, with the way back. -->
    <div v-if="activeMembership" class="border-b border-tertiary/30 bg-tertiary/10">
      <div class="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-2 text-small md:px-8">
        <span class="text-ink-muted">You're in <strong class="font-medium text-ink">{{ activeMembership.name }}</strong>'s account as a <strong class="font-medium text-ink">{{ ROLE_LABEL[role] }}</strong><template v-if="role === 'viewer'"> (view only)</template>.</span>
        <button type="button" class="text-tertiary hover:text-ink hover:underline" @click="switchAccount(null)">Back to your account</button>
      </div>
    </div>

    <main class="mx-auto max-w-6xl px-4 py-8 md:px-8 md:py-10">
      <!-- Keyed by route and item, so moving between two routes that share a page starts it fresh;
           query-only changes (filters, tabs) keep it. -->
      <RouterView v-slot="{ Component, route: r }">
        <component :is="Component" :key="`${String(r.name)}:${r.params.id ?? ''}`" />
      </RouterView>
    </main>
  </div>
</template>
