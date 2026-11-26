import { callApi } from '@/services/WebApi';

// An account's own templates.
export const listTemplates = () => callApi('GET', 'templates').then((r) => r.data);
export const searchTemplates = (keyword) => callApi('GET', `templates/search?keyword=${encodeURIComponent(keyword)}`).then((r) => r.data);
export const getTemplate = (id) => callApi('GET', `template/${id}`).then((r) => r.data);
export const createTemplate = (body) => callApi('POST', 'template', body).then((r) => r.data);
export const updateTemplate = (id, body) => callApi('PUT', `template/${id}`, body).then((r) => r.data);
export const deleteTemplate = (id) => callApi('DELETE', `template/${id}`).then((r) => r.data);
export const duplicateTemplate = (id) => callApi('POST', `template/${id}/duplicate`).then((r) => r.data);
// Starts a .docx export; resolves with the template, including the new "processing" entry.
// valueSetId: the value set that fills the placeholders (null = none); values: single keys that override it.
export const generateDocument = (id, { valueSetId = null, values, pdf = false } = {}) => callApi('POST', 'template/generate', { id, valueSetId, ...(values && { values }), pdf }).then((r) => r.data);
export const deleteExport = (id, cbId) => callApi('DELETE', `template/${id}/export/${cbId}`).then((r) => r.data);

// Staff-published masters: any account lists them and clones one.
export const listMasters = () => callApi('GET', 'template-masters').then((r) => r.data);
export const cloneMaster = (id) => callApi('POST', 'template/clone-master', { id }).then((r) => r.data);

// Staff: manage the masters.
export const listMasterTemplates = () => callApi('GET', 'staff/master-templates').then((r) => r.data);
export const createMasterTemplate = (body) => callApi('POST', 'staff/master-templates', body).then((r) => r.data);
export const getMasterTemplate = (id) => callApi('GET', `staff/master-templates/${id}`).then((r) => r.data);
export const updateMasterTemplate = (id, body) => callApi('PUT', `staff/master-templates/${id}`, body).then((r) => r.data);
export const deleteMasterTemplate = (id) => callApi('DELETE', `staff/master-templates/${id}`).then((r) => r.data);

// The editor works against either set.
export const ownApi = { get: getTemplate, update: updateTemplate };
export const masterApi = { get: getMasterTemplate, update: updateMasterTemplate };
