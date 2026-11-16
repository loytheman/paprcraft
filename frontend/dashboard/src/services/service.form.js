import { callApi } from '@/services/WebApi';

// An account's own forms.
export const listForms = () => callApi('GET', 'forms').then((r) => r.data);
export const getForm = (id) => callApi('GET', `form/${id}`).then((r) => r.data);
export const createForm = (body) => callApi('POST', 'form', body).then((r) => r.data);
export const updateForm = (id, body) => callApi('PUT', `form/${id}`, body).then((r) => r.data);
export const deleteForm = (id) => callApi('DELETE', `form/${id}`).then((r) => r.data);
export const duplicateForm = (id) => callApi('POST', `form/${id}/duplicate`).then((r) => r.data);
// Publishing validates the form and bumps its version; a problem list comes back as e.data.problems.
export const publishForm = (id) => callApi('POST', `form/${id}/publish`).then((r) => r.data);
export const unpublishForm = (id) => callApi('POST', `form/${id}/unpublish`).then((r) => r.data);

// Staff-published masters: any account lists them and clones one (its output template comes along).
export const listMasters = () => callApi('GET', 'form-masters').then((r) => r.data);
export const cloneMaster = (id) => callApi('POST', 'form/clone-master', { id }).then((r) => r.data);

// Staff: manage the masters.
export const listMasterForms = () => callApi('GET', 'staff/master-forms').then((r) => r.data);
export const createMasterForm = (body) => callApi('POST', 'staff/master-forms', body).then((r) => r.data);
export const getMasterForm = (id) => callApi('GET', `staff/master-forms/${id}`).then((r) => r.data);
export const updateMasterForm = (id, body) => callApi('PUT', `staff/master-forms/${id}`, body).then((r) => r.data);
export const deleteMasterForm = (id) => callApi('DELETE', `staff/master-forms/${id}`).then((r) => r.data);
export const publishMasterForm = (id) => callApi('POST', `staff/master-forms/${id}/publish`).then((r) => r.data);
export const unpublishMasterForm = (id) => callApi('POST', `staff/master-forms/${id}/unpublish`).then((r) => r.data);

// The builder works against either set.
export const ownApi = { get: getForm, update: updateForm, publish: publishForm, unpublish: unpublishForm };
export const masterApi = { get: getMasterForm, update: updateMasterForm, publish: publishMasterForm, unpublish: unpublishMasterForm };
