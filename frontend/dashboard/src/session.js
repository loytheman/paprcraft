// Signed-in state. Nothing is kept in localStorage: on every page load the session is resumed
// from the httpOnly refresh-token cookie (/auth/resume-login), and the access token stays in
// memory only. That one call also completes "Sign in with Google" — the API's callback sets the
// cookie and redirects here, and this resume is what turns it into a signed-in dashboard.
import { reactive, readonly } from 'vue';
import { callApi, setAccessToken } from '@/services/WebApi';
import { resetTeam } from '@/team';

const state = reactive({ user: null, checked: false, suspended: false });

const decodeJwt = (token) => {
  const payload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
  const bytes = Uint8Array.from(atob(payload), (c) => c.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
};

const applyTokens = ({ accessToken, idToken }) => {
  const id = decodeJwt(idToken);
  setAccessToken(accessToken);
  state.user = {
    id: id.sub,
    email: id.email,
    firstName: id.firstName ?? '',
    lastName: id.lastName ?? '',
    role: id.role,
  };
};

const clear = () => {
  setAccessToken(null);
  resetTeam();
  state.user = null;
};

// Resolves to true when signed in. Safe to call repeatedly; only the first call hits the API
// unless `force` is set.
export const resumeSession = async (force = false) => {
  if (state.checked && !force) return !!state.user;
  try {
    const res = await callApi('POST', 'auth/resume-login');
    applyTokens(res.data);
    state.suspended = false;
  } catch (e) {
    clear();
    // Staff suspended the account: the login page says so instead of just asking to sign in.
    state.suspended = e?.code === 'account_suspended';
  }
  state.checked = true;
  return !!state.user;
};

export const signOut = async () => {
  try {
    await callApi('POST', 'auth/sign-out');
  } catch {
    // The cookie may already be gone; signing out locally is still right.
  }
  clear();
};

export const session = readonly(state);

// Paprcraft staff (role set by backend/api/src/scripts/staff-role.js). Only hides or shows the
// staff screens; the API checks the role on every staff request.
export const isStaff = () => state.user?.role === 'administrator';
