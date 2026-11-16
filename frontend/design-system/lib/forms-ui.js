// UI helpers for FormRenderer (components/FormRenderer.vue): kept apart from lib/forms.js, which is a
// copy of the API's form engine and must not change on its own.
import { countryName } from './countries.js';

export const FILE_ACCEPT = 'image/png,image/jpeg,image/webp,application/pdf';
export const FILE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'application/pdf'];
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_FILES_PER_FIELD = 5;

// A value the form treats as "no answer": it is removed from the values rather than stored.
export const isBlank = (v) => v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);

// values with `key` set to `v` (or removed when blank). A new object, so v-model sees the change.
export const withValue = (values, key, v) => {
  const next = { ...(values ?? {}) };
  if (isBlank(v)) delete next[key];
  else next[key] = v;
  return next;
};

// A group row with the field removed/set, same rule.
export const withRowValue = (row, key, v) => withValue(row, key, v);

// The first error for a top-level field (no row).
export const errorFor = (errors, key) => (errors ?? []).find((e) => e.key === key && e.row === undefined)?.message ?? '';
// Row errors of a group: [{ row, field, message }].
export const rowErrorsFor = (errors, key) => (errors ?? []).filter((e) => e.key === key && e.row !== undefined);

// "12.3 KB" for a file list.
export const fileSize = (n) => {
  if (!Number.isFinite(n)) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
};

// Why a file can't be added, or '' when it can.
export const fileProblem = (file, existingCount) => {
  if (existingCount >= MAX_FILES_PER_FIELD) return `Up to ${MAX_FILES_PER_FIELD} files.`;
  if (!FILE_TYPES.includes(file.type)) return 'Use a PNG, JPEG, WebP or PDF file.';
  if (file.size > MAX_FILE_BYTES) return `Each file can be up to ${MAX_FILE_BYTES / 1024 / 1024} MB.`;
  if (file.size === 0) return 'That file is empty.';
  return '';
};

const optionLabel = (f, v) => (f.options ?? []).find((o) => o.value === v)?.label ?? v;

// Plain text of an answer, for readonly mode. Groups and files are rendered by the component itself.
export const answerText = (f, v) => {
  if (v === undefined || v === null || v === '') return '';
  switch (f.type) {
    case 'select': return optionLabel(f, v);
    case 'multiselect': return (v ?? []).map((x) => optionLabel(f, x)).join(', ');
    case 'yesno': return v === true ? 'Yes' : v === false ? 'No' : '';
    case 'country': return countryName(v);
    case 'signature': return v?.name ? `${v.name}${v.consent ? ' (signed)' : ''}` : '';
    case 'checklist': return (f.options ?? []).map((o) => `${o.label}: ${v?.[o.value] === true ? 'Yes' : v?.[o.value] === false ? 'No' : '-'}`).join('\n');
    default: return String(v);
  }
};
