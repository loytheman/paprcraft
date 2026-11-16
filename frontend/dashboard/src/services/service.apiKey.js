import { callApi } from '@/services/WebApi';

// The account's API key (backend service.apiKey.js). The token is only returned when it is made.
export const getKey = () => callApi('GET', 'api-key').then((r) => r.data);
export const regenerate = () => callApi('POST', 'api-key').then((r) => r.data);
export const revoke = () => callApi('DELETE', 'api-key').then((r) => r.data);
