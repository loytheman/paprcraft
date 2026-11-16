import { callApi } from '@/services/WebApi';

// Closing your own account (backend service.accountClosure.js).
// What closing would remove: { email, staff, plan, periodEnd, counts }.
export const getClosurePreview = () => callApi('GET', 'account-closure').then((r) => r.data);
// confirmEmail: the account's email, typed back.
export const closeAccount = (confirmEmail) => callApi('POST', 'account-closure', { confirmEmail }).then((r) => r.data);
