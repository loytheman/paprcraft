import { callApi } from '@/services/WebApi';

// The account's value sets: named { KEY: value } maps that fill a template's {{KEY}} chips.
export const listValueSets = () => callApi('GET', 'value-sets').then((r) => r.data);
export const createValueSet = (body) => callApi('POST', 'value-set', body).then((r) => r.data);
export const updateValueSet = (id, body) => callApi('PUT', `value-set/${id}`, body).then((r) => r.data);
export const deleteValueSet = (id) => callApi('DELETE', `value-set/${id}`).then((r) => r.data);
