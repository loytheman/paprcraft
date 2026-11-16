import { callApi } from '@/services/WebApi';

// Teams (backend service.team.js).
const data = (r) => r.data;
// The active account's team: { owner, members, seats: { used, limit }, available }.
export const getTeam = () => callApi('GET', 'team').then(data);
export const invite = (email, role) => callApi('POST', 'team/invite', { email, role }).then(data);
export const resendInvite = (id) => callApi('POST', `team/member/${id}/resend`).then(data);
export const changeRole = (id, role) => callApi('PUT', `team/member/${id}`, { role }).then(data);
export const removeMember = (id) => callApi('DELETE', `team/member/${id}`).then(data);
// Yours: the accounts you're on the team of, leaving one, and invites.
export const getMemberships = () => callApi('GET', 'team/memberships').then(data);
export const leave = (accountId) => callApi('POST', 'team/leave', { accountId }).then(data);
export const getInvite = (token) => callApi('GET', `team/invite/${encodeURIComponent(token)}`).then(data);
export const acceptInvite = (token) => callApi('POST', 'team/invite/accept', { token }).then(data);
