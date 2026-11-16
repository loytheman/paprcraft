// Landing is a fully static build (same dist deployed to stg and prod, see package.json's
// deploy/deploy-prod — no --mode split), so the dashboard host is derived from the hostname the
// page is actually running on.
const hostname = window.location.hostname;
const isProd = hostname === 'paprcraft.com' || hostname === 'www.paprcraft.com';

const apiUrl = isProd ? 'https://api.paprcraft.com/v1' : 'https://api-stg.paprcraft.com/v1';
// "Sign in with Google" starts at the API (controller.auth.js googleStart), which finds or creates
// the account and lands the browser on the dashboard signed in — so sign in and sign up are the
// same link.
const googleSignInUrl = `${apiUrl}/auth/google/start`;

export default {
  apiUrl,
  dashboardUrl: isProd ? 'https://dashboard.paprcraft.com' : 'https://dashboard-stg.paprcraft.com',
  signInUrl: googleSignInUrl,
  signUpUrl: googleSignInUrl,
};
