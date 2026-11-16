// Which account you're working in: your own, or one you're on the team of (Pro teams; backend
// service.team.js). Remembered per person in this browser, and sent with every API call
// (WebApi.js). Switching reloads the app, so every page starts fresh on the new account.
//   role: 'owner' (your own account) | 'member' (all but billing and the team) | 'viewer' (read-only)
import { computed, reactive } from 'vue';
import { setActiveAccount } from '@/services/WebApi';
import * as TeamService from '@/services/service.team';

const state = reactive({ userId: null, memberships: [], activeId: null, loaded: false });
const keyFor = (userId) => `paprcraft.account.${userId}`;
const read = (userId) => { try { return localStorage.getItem(keyFor(userId)); } catch { return null; } };
const write = (userId, id) => { try { id ? localStorage.setItem(keyFor(userId), id) : localStorage.removeItem(keyFor(userId)); } catch { /* storage blocked */ } };

// After sign-in, before any page loads data: your memberships, and the account you were in last
// (if you still have access to it).
let loading = null;
export const initTeam = (userId) => {
  if (state.loaded && state.userId === userId) return Promise.resolve();
  if (loading) return loading;
  state.userId = userId;
  const remembered = read(userId);
  // Use the remembered account straight away; it's dropped below if access is gone.
  setActiveAccount(remembered);
  state.activeId = remembered;
  loading = TeamService.getMemberships()
    .then((list) => { state.memberships = list; })
    .catch(() => { state.memberships = []; })
    .finally(() => {
      if (state.activeId && !state.memberships.some((m) => m.accountId === state.activeId && m.available)) {
        state.activeId = null;
        setActiveAccount(null);
        write(userId, null);
      }
      state.loaded = true;
      loading = null;
    });
  return loading;
};

export const resetTeam = () => {
  Object.assign(state, { userId: null, memberships: [], activeId: null, loaded: false });
  setActiveAccount(null);
};

// null = your own account.
export const switchAccount = (accountId) => {
  write(state.userId, accountId);
  window.location.assign('/');
};

export const memberships = computed(() => state.memberships);
export const activeMembership = computed(() => state.memberships.find((m) => m.accountId === state.activeId) ?? null);
export const role = computed(() => activeMembership.value?.role ?? 'owner');
export const isOwner = computed(() => role.value === 'owner');
export const canEdit = computed(() => role.value !== 'viewer');
export const ROLE_LABEL = { owner: 'Owner', member: 'Member', viewer: 'Viewer' };
