import { callApi } from '@/services/WebApi';

// Form submissions: an account's own (backend/api service.submission.js).
export const listSubmissions = ({ formId, status } = {}) => {
  const q = new URLSearchParams();
  if (formId) q.set('formId', formId);
  if (status) q.set('status', status);
  return callApi('GET', `submissions${q.size ? `?${q}` : ''}`).then((r) => r.data);
};
export const getSubmission = (id) => callApi('GET', `submission/${id}`).then((r) => r.data);
export const createSubmission = (body) => callApi('POST', 'submission', body).then((r) => r.data);
export const deleteSubmission = (id) => callApi('DELETE', `submission/${id}`).then((r) => r.data);

// Saves a draft: { title?, values?, attachments? }. Resolves with the submission plus `errors`
// (answers the server left out because they were invalid).
export const saveSubmission = (id, body) => callApi('PUT', `submission/${id}`, body).then((r) => r.data);
// Rejects with a 422 whose `data.errors` lists the answers to fix.
export const submitSubmission = (id) => callApi('POST', `submission/${id}/submit`, {}).then((r) => r.data);
export const approveSubmission = (id, comment) => callApi('POST', `submission/${id}/approve`, { comment: comment || '' }).then((r) => r.data);
export const rejectSubmission = (id, comment) => callApi('POST', `submission/${id}/reject`, { comment }).then((r) => r.data);
export const reopenSubmission = (id) => callApi('POST', `submission/${id}/reopen`, {}).then((r) => r.data);

// Customer link. createLink resolves with { url, expiresAt, emailed }; the URL is shown once.
export const createLink = (id, { email, expiresInDays }) => callApi('POST', `submission/${id}/link`, { email: email || '', expiresInDays }).then((r) => r.data);
export const revokeLink = (id) => callApi('DELETE', `submission/${id}/link`).then((r) => r.data);

// Starts a .docx export from the form's template; resolves with the submission, including the new
// "processing" entry in exportHistory (the docx Lambda completes it).
// valueSetId: the value set for the template's placeholders (undefined = the template's own, '' = none).
export const generateDocument = (id, pdf = false, valueSetId = undefined) => callApi('POST', `submission/${id}/generate`, { pdf, ...(valueSetId !== undefined && { valueSetId }) }).then((r) => r.data);

// The forms the pages need: published ones to start from, one form's settings.
export const listForms = () => callApi('GET', 'forms').then((r) => r.data);
export const getFormInfo = (id) => callApi('GET', `form/${id}`).then((r) => r.data);

// Uploads one file for a file field: asks the API for a presigned PUT, sends the file straight to
// S3, and resolves with { key, name } for the next save. The content type is signed into the URL,
// so the PUT must send exactly that.
export const uploadFile = async (id, file) => {
  const { uploadUrl, key, contentType, maxBytes } = await callApi('POST', 'submission/attachment-url', { id, contentType: file.type }).then((r) => r.data);
  if (maxBytes && file.size > maxBytes) throw { message: `Each file can be up to ${Math.round(maxBytes / 1024 / 1024)} MB.` };
  let res;
  try {
    res = await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': contentType }, body: file });
  } catch {
    throw { message: 'The upload failed. Check your connection and try again.' };
  }
  if (!res.ok) throw { message: 'The upload failed. Try again.' };
  return { key, name: file.name };
};
