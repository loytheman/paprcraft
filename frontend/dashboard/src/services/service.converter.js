import { callApi } from './WebApi';

export const createUpload = (name, size) => callApi('POST', 'converter/upload-url', { name, size }).then((r) => r.data);
export const startConversion = (id) => callApi('POST', `converter/${id}/start`, {}).then((r) => r.data);
export const conversionStatus = (id, name) => callApi('GET', `converter/${id}?name=${encodeURIComponent(name ?? '')}`).then((r) => r.data);
