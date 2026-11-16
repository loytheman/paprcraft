import { callApi } from '@/services/WebApi';

// The audit trail (kept forever). Pages are newest first; pass the previous page's `next` to go on.
// The API's response formatter (middlewares/responseFormat.js) sends a page as
// { data: [rows], pagination: { next } }; this returns { results, next }.
const toPage = (r) => ({ results: r.data ?? [], next: r.pagination?.next ?? null });
const qs = (o) => Object.entries(o).filter(([, v]) => v != null && v !== '').map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');

export const getAccountActivity = ({ category, next, limit = 30 } = {}) =>
  callApi('GET', `activity/account?${qs({ category, next, limit })}`).then(toPage);

