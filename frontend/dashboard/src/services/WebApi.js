// Thin fetch wrapper for backend/api. Every call sends cookies (credentials: 'include'): the
// refresh token lives in an httpOnly, SameSite=Strict cookie on the API host, which the browser
// sends because dashboard(-stg) and api(-stg) are the same site (paprcraft.com).
// Responses use the API's envelope ({ status: 'success', data } / { status: 'fail', code, message });
// anything other than success is thrown as that envelope plus httpStatus. Validation failures
// also carry fieldErrors: [{ field, message }] (the API sends them as a JSON string).
import env from '@/helpers/Environment';

let accessToken = null;
export const setAccessToken = (token) => { accessToken = token; };

// The account being worked in, when it isn't your own (team members; see @/team.js). Sent as
// X-Paprcraft-Account; the API checks you belong to it (backend middlewares/auth.js).
let activeAccountId = null;
export const setActiveAccount = (id) => { activeAccountId = id || null; };

const parseFieldErrors = (json) => {
  try {
    const list = JSON.parse(json.data?.validation ?? '[]');
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
};

export const callApi = async (method, endpoint, body) => {
  const headers = { 'Content-Type': 'application/json' };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  if (activeAccountId) headers['X-Paprcraft-Account'] = activeAccountId;

  let res;
  try {
    res = await fetch(`${env.apiUrl}/${endpoint}`, {
      method,
      headers,
      credentials: 'include',
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw { httpStatus: 0, status: 'fail', code: 'service_unavailable', message: 'Could not reach the server.' };
  }

  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.status !== 'success') throw { httpStatus: res.status, ...json, fieldErrors: parseFieldErrors(json) };
  return json;
};
