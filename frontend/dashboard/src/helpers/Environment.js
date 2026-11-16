// One static build serves every env, so the API host is derived from the hostname the dashboard
// is running on (same approach as frontend/landing):
//   localhost                -> backend/api's local dev server (`yarn dev` there, https :3006).
//                               Visit https://localhost:3006 once and accept its self-signed cert.
//   dashboard.paprcraft.com   -> prod API
//   anything else            -> stg API
// TODO: replace paprcraft.com with the real domain (BASE_DOMAIN in backend/infra/_env.sh).
const hostname = window.location.hostname;
const isLocal = hostname === 'localhost' || hostname === '127.0.0.1';
const isProd = hostname === 'dashboard.paprcraft.com';

const apiUrl = isLocal
  ? `https://${hostname}:3006/v1`
  : isProd ? 'https://api.paprcraft.com/v1' : 'https://api-stg.paprcraft.com/v1';

export default {
  apiUrl,
  googleSignInUrl: `${apiUrl}/auth/google/start`,
  landingUrl: isProd ? 'https://paprcraft.com' : 'https://stg.paprcraft.com',
};
