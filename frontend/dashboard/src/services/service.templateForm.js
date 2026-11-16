import { callApi } from '@/services/WebApi';

// The form a template reads its fields from (the editor's "Data source"). An account's own forms, or
// for a staff master template the master forms.
export const listSourceForms = (master) => callApi('GET', master ? 'staff/master-forms' : 'forms').then((r) => r.data);
export const getSourceForm = (master, id) => callApi('GET', master ? `staff/master-forms/${id}` : `form/${id}`).then((r) => r.data);
