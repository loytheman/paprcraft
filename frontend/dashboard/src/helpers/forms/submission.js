// Pure helpers of the submissions UI: status labels and colours, what each role may do in each
// status, the 422 answer-error mapping, the attachment list the API wants, and keeping the local
// attachment list in step with the server while autosave is in flight. No Vue, no fetch: tested in
// test/submission.helpers.test.mjs.

export const STATUSES = ['draft', 'submitted', 'approved', 'rejected'];

// OpStatusBadge tones: info / warn / ok / down.
export const STATUS_META = {
  draft: { label: 'Draft', tone: 'info', hint: 'Being filled in. Answers save automatically.' },
  submitted: { label: 'Submitted', tone: 'warn', hint: 'Waiting for a decision.' },
  approved: { label: 'Approved', tone: 'ok', hint: 'Approved.' },
  rejected: { label: 'Rejected', tone: 'down', hint: 'Rejected. Reopen it to correct the answers.' },
};
export const statusMeta = (status) => STATUS_META[status] ?? { label: status ?? '', tone: 'info', hint: '' };

// Who did it: a user's name or email; the customer link has a name but no email.
export const actorName = (actor) => actor?.name || actor?.email || '';

// What the page offers. `role` is 'owner' | 'member' | 'viewer' (src/team.js). Viewers can only look.
export const actionsFor = (status, role) => {
  const edit = role !== 'viewer';
  return {
    editAnswers: edit && status === 'draft',
    submit: edit && status === 'draft',
    approve: edit && status === 'submitted',
    reject: edit && status === 'submitted',
    reopen: edit && status !== 'draft',
    share: edit && status === 'draft',
    generate: edit,
    remove: edit,
  };
};

// Why "Generate" is unavailable, or '' when it is allowed. `form` is the submission's form (may be
// null if it couldn't be loaded).
export const generateBlock = (sub, form, role) => {
  if (role === 'viewer') return 'Viewers can only look.';
  if (!form) return 'The form could not be loaded.';
  if (!form.templateId) return 'This form has no document template yet.';
  if (form.settings?.requireApprovedToExport && sub?.status !== 'approved') return 'This form only exports approved submissions.';
  return '';
};

// ---- answers errors ---------------------------------------------------------------------------------

// The API's 422 carries { data: { errors: [{ key, message, row?, field? }] } }; anything else is a
// plain message. -> { errors, message }
export const mapSubmitErrors = (err) => {
  const list = err?.data?.errors;
  if (Array.isArray(list) && list.length) {
    const first = list[0];
    return {
      errors: list,
      message: `${list.length} answer${list.length === 1 ? ' needs' : 's need'} attention${first?.message ? `: ${first.message}` : '.'}`,
    };
  }
  return { errors: [], message: err?.fieldErrors?.[0]?.message || err?.message || 'Something went wrong. Try again.' };
};

// ---- attachments ------------------------------------------------------------------------------------

// The server's attachments -> what FormRenderer shows (no storage path).
export const toRendererAttachments = (list = []) =>
  list.map((a) => ({ id: a.id, name: a.name, size: a.size, type: a.type, fieldKey: a.fieldKey, ...(a.url && { url: a.url }) }));

// What the API takes: an existing file by id, a new upload by its tmp key (+ name), always with its field.
export const toSaveAttachments = (list = []) =>
  list.map((a) => (a.id ? { id: a.id, fieldKey: a.fieldKey } : { key: a.key, name: a.name, fieldKey: a.fieldKey }));

// After a save, adopt the server's list (it knows the new ids), but keep what the user did while the
// request was running: files added since (no id, key not in `sent`) stay, files they removed (sent
// with an id, now gone locally) stay removed.
export const reconcileAttachments = (sent, local, server) => {
  const sentKeys = new Set(sent.filter((a) => a.key).map((a) => a.key));
  const sentIds = new Set(sent.filter((a) => a.id).map((a) => a.id));
  const localIds = new Set(local.filter((a) => a.id).map((a) => a.id));
  const removedWhileSaving = new Set([...sentIds].filter((id) => !localIds.has(id)));
  const kept = toRendererAttachments(server).filter((a) => !removedWhileSaving.has(a.id));
  const addedWhileSaving = local.filter((a) => !a.id && a.key && !sentKeys.has(a.key));
  return [...kept, ...addedWhileSaving];
};

export const fileSize = (bytes) => {
  if (!Number.isFinite(bytes)) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};

// ---- customer link ------------------------------------------------------------------------------------

// A one-line state for the link card from the API's `link` summary.
export const linkState = (link, now = Date.now()) => {
  if (!link || (!link.active && !link.expiresAt)) return { kind: 'none', text: 'Not shared.' };
  if (link.locked) return { kind: 'used', text: 'The customer has submitted through this link. It is closed.' };
  if (!(Date.parse(link.expiresAt) > now)) return { kind: 'expired', text: 'The link has expired.' };
  return { kind: 'active', text: `Active until ${new Date(link.expiresAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}${link.email ? `, sent to ${link.email}` : ''}.` };
};

// ---- list ---------------------------------------------------------------------------------------------

export const matchesSearch = (s, needle) => {
  const n = (needle ?? '').trim().toLowerCase();
  return !n || `${s.title ?? ''} ${s.formName ?? ''}`.toLowerCase().includes(n);
};

export const submissionTitle = (s) => s.title || s.formName || 'Untitled';
