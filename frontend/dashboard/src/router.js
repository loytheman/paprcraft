import { createRouter, createWebHistory } from 'vue-router';
import { session, resumeSession, isStaff } from '@/session';
import { canEdit, initTeam, isOwner } from '@/team';
import { takeAfterSignIn } from '@/helpers/AfterSignIn';
import AppLayout from '@/views/layout/AppLayout.vue';
// Not lazy-loaded on purpose. The router waits for a lazy page's file before reacting to a click,
// and each deploy deletes the old files, so a tab opened before a deploy would ignore clicks.
import AuthLogin from '@/views/Auth.Login.vue';
import SettingsAccount from '@/views/Settings.Account.vue';
import SettingsTeam from '@/views/Settings.Team.vue';
import TeamInvite from '@/views/Team.Invite.vue';
import SettingsActivity from '@/views/Settings.Activity.vue';
import StaffCustomers from '@/views/Staff.Customers.vue';
import StaffCustomer from '@/views/Staff.Customer.vue';
import Home from '@/views/Home.vue';
import SettingsApiKey from '@/views/Settings.ApiKey.vue';
import SettingsLabels from '@/views/Settings.Labels.vue';
import TemplateList from '@/views/Template.List.vue';
import TemplateEdit from '@/views/Template.Edit.vue';
import StaffTemplates from '@/views/Staff.Templates.vue';
import StaffTemplate from '@/views/Staff.Template.vue';

// Back/forward restores the old position; a #anchor waits briefly for its element (pages load their
// data first, e.g. an #anchor); any other new page starts at the top.
const waitForElement = (selector, ms = 3000) => new Promise((resolve) => {
  const start = Date.now();
  const tick = () => {
    if (document.querySelector(selector) || Date.now() - start > ms) resolve();
    else setTimeout(tick, 50);
  };
  tick();
});

const router = createRouter({
  history: createWebHistory(),
  async scrollBehavior(to, from, saved) {
    if (saved) return saved;
    if (to.hash) {
      await waitForElement(to.hash);
      return document.querySelector(to.hash) ? { el: to.hash, top: 80, behavior: 'smooth' } : { top: 0 };
    }
    if (to.path !== from.path) return { top: 0 };
    return false;
  },
  routes: [
    {
      path: '/',
      component: AppLayout,
      meta: { requireAuth: true }, // merged into every child's meta
      children: [
        { path: '', name: 'home', component: Home },
        // Document templates: the editor is read-only for viewers (TemplateEditor.vue).
        { path: 'templates', name: 'templates', component: TemplateList },
        { path: 'templates/:id', name: 'template', component: TemplateEdit },
        { path: 'settings/labels', name: 'labels', component: SettingsLabels },
        { path: 'settings/team', name: 'team', component: SettingsTeam },
        { path: 'settings/activity', name: 'activity', component: SettingsActivity },
        { path: 'settings/api-key', name: 'api-key', component: SettingsApiKey, meta: { ownerOnly: true } },
        { path: 'settings/account', name: 'account', component: SettingsAccount },
        // Paprcraft staff console: hidden from everyone else (the API also refuses them).
        { path: 'staff/templates', name: 'staff-templates', component: StaffTemplates, meta: { requireStaff: true } },
        { path: 'staff/templates/:id', name: 'staff-template', component: StaffTemplate, meta: { requireStaff: true } },
        { path: 'staff/customers', name: 'staff-customers', component: StaffCustomers, meta: { requireStaff: true } },
        { path: 'staff/customers/:id', name: 'staff-customer', component: StaffCustomer, meta: { requireStaff: true } },
      ],
    },
    { path: '/auth/login', name: 'login', component: AuthLogin },
    // Public: a team invite link from email. Signing in (Google) happens from the page itself.
    { path: '/invite', name: 'invite', component: TeamInvite },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
});

router.beforeEach(async (to) => {
  // ?google_signin=1 is added by the API's Google callback. A fresh resume picks up the cookie it
  // just set; the marker is then dropped from the URL.
  const googleSignIn = to.query.google_signin === '1';
  const signedIn = await resumeSession(googleSignIn);

  // Which account to work in (yours, or a team's) is known before any page asks for data.
  if (signedIn) await initTeam(session.user.id);

  if (googleSignIn) {
    // Back to where sign-in started (e.g. a team invite), else drop the marker from the URL.
    const back = takeAfterSignIn();
    if (back) return { path: back, replace: true };
    const { google_signin, ...query } = to.query;
    return { path: to.path, query, replace: true };
  }
  if (to.meta.requireAuth && !signedIn) {
    if (session.suspended) return { name: 'login', query: { error: 'account_suspended' } };
    return { name: 'login', query: to.fullPath === '/' ? {} : { redirect: to.fullPath } };
  }
  if (to.meta.requireStaff && !isStaff()) return { name: 'home' };
  // Owner-only pages (e.g. the API key); team members and viewers don't see them.
  if (to.meta.ownerOnly && !isOwner.value) return { name: 'home' };
  // Viewers are read-only: no add or edit forms.
  if (to.meta.canEdit && !canEdit.value) return { name: 'home' };
  if (to.name === 'login' && session.user) {
    const r = to.query.redirect;
    // Only in-app paths: never "//host" or "https://..." (open redirect).
    return typeof r === 'string' && r.startsWith('/') && !r.startsWith('//') ? r : '/';
  }
});

export default router;
