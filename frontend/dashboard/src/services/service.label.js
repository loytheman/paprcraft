import { callApi } from '@/services/WebApi';

export const getLabels = () => callApi('GET', 'labels').then((r) => r.data);
export const createLabel = (body) => callApi('POST', 'label', body).then((r) => r.data);
export const updateLabel = (id, body) => callApi('PUT', `label/${id}`, body).then((r) => r.data);
export const deleteLabel = (id) => callApi('DELETE', `label/${id}`).then((r) => r.data);
