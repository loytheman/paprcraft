import { callApi } from '@/services/WebApi';

// Paprcraft staff console (backend/api/src/services/service.staff.js). The API refuses anyone who
// isn't staff, whatever the dashboard shows.
const qs = (o) => Object.entries(o).filter(([, v]) => v != null && v !== '').map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
const data = (r) => r.data;

export const listCustomers = ({ q, filter, offset = 0, limit = 50 } = {}) => callApi('GET', `staff/customers?${qs({ q, filter, offset, limit })}`).then(data);
export const getCustomer = (id) => callApi('GET', `staff/customers/${id}`).then(data);
export const setComplimentary = (id, plan, reason) => callApi('PUT', `staff/customers/${id}/complimentary`, { plan, reason }).then(data);
// limits: { field: { value, until } | null }
export const setLimits = (id, limits, reason) => callApi('PUT', `staff/customers/${id}/limits`, { limits, reason }).then(data);
export const setStatus = (id, status, reason) => callApi('PUT', `staff/customers/${id}/status`, { status, reason }).then(data);
export const setNotes = (id, notes) => callApi('PUT', `staff/customers/${id}/notes`, { notes }).then(data);
// The customer's full audit trail, staff names and connection details included.
export const getActivity = (id, next = null) =>
  callApi('GET', `activity?${qs({ accountId: id, next, limit: 20 })}`).then((r) => ({ results: r.data ?? [], next: r.pagination?.next ?? null }));
// Closing a customer's account (backend service.accountClosure.js): what goes, then do it.
export const getClosurePreview = (id) => callApi('GET', `staff/customers/${id}/closure`).then(data);
export const closeAccount = (id, reason) => callApi('POST', `staff/customers/${id}/close`, { reason }).then(data);
