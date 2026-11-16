// One static build serves every env, so the API host comes from the hostname (same approach as
// frontend/dashboard and frontend/landing):
//   localhost                -> backend/api's local dev server (https :3006)
//   forms.paprcraft.com      -> prod API
//   anything else            -> stg API
// TODO: replace paprcraft.com with the real domain (BASE_DOMAIN in backend/infra/_env.sh).
const hostname = window.location.hostname;
const isLocal = hostname === 'localhost' || hostname === '127.0.0.1';
const isProd = hostname === 'forms.paprcraft.com';

export default {
  apiUrl: isLocal ? `https://${hostname}:3006/v1` : isProd ? 'https://api.paprcraft.com/v1' : 'https://api-stg.paprcraft.com/v1',
};
