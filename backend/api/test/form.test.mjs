// Dynamic forms (src/services/service.form.js, service.submission.js): publishing and versions, schema
// snapshots, the draft/submit/approve/reject/reopen flow, plan limits, customer links (hashed token,
// expiry, lock, internal fields hidden and untouchable) and cloning a master with its template.
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const u = (p) => new URL('../src/' + p, import.meta.url).href;
const V = JSON.parse(readFileSync(new URL('./formEngine.vectors.json', import.meta.url), 'utf8'));

const forms = {};
const subs = {};
const emails = [];
const invokes = [];
let invokeFails = false;
const config = { aws: { s3Bucket: 'bkt' }, docx: { lambdaName: 'fn' } };
const cloned = [];
let seq = 0;
let limits = { formLimit: 2, submissionLimit: 3 };
const ApiError = class extends Error { constructor(s, c, m) { super(m); this.statusCode = s; } };

const sparse = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
mock.module(u('models/model.form.js'), {
  namedExports: { formStatus: { DRAFT: 'draft', PUBLISHED: 'published' } },
  defaultExport: {
    create: async (d) => (forms[`F${++seq}`] = { id: `F${seq}`, updatedAt: String(seq), ...d }),
    getById: async (id) => forms[id] ?? null,
    getAllForAccount: async (a) => Object.values(forms).filter((f) => f.accountId === a),
    update: async (d) => { forms[d.id] = { ...forms[d.id], ...d }; return forms[d.id]; },
    remove: async (id) => { delete forms[id]; },
  },
});
mock.module(u('models/model.submission.js'), {
  namedExports: { submissionStatus: { DRAFT: 'draft', SUBMITTED: 'submitted', APPROVED: 'approved', REJECTED: 'rejected' } },
  defaultExport: {
    create: async (d) => (subs[`S${++seq}`] = { id: `S${seq}`, updatedAt: String(seq), ...d }),
    getById: async (id) => subs[id] ?? null,
    getAllForAccount: async (a) => Object.values(subs).filter((s) => s.accountId === a),
    getAllForForm: async (f) => Object.values(subs).filter((s) => s.formId === f),
    getByTokenHash: async (h) => Object.values(subs).find((s) => s.tokenHash === h) ?? null,
    update: async (d) => { subs[d.id] = sparse({ ...subs[d.id], ...d }); return subs[d.id]; },
    removeLink: async (id) => { const { tokenHash, publicExpiresAt, publicEmail, ...rest } = subs[id]; subs[id] = rest; },
    remove: async (id) => { delete subs[id]; },
    addExport: async (id, entry) => { subs[id] = { ...subs[id], exportHistory: [...(subs[id].exportHistory ?? []), entry] }; return subs[id]; },
  },
});
mock.module(u('models/model.template.js'), { namedExports: { MASTER_ACCOUNT_ID: 'MASTER' } });
mock.module(u('services/service.template.js'), { namedExports: { cloneTemplate: async (id, from, to) => { cloned.push({ id, from, to }); return { id: `T-${to}` }; }, updateTemplate: async (d) => { cloned.push({ bind: d }); return d; } } });
mock.module(u('services/service.plan.js'), { namedExports: {
  getAccountPlan: async () => ({ ...limits, name: 'Free', key: 'free' }),
  planLimitError: (m) => Object.assign(new Error(m), { statusCode: 402 }),
  isTopPlan: () => false, includesText: () => 'Your Free plan includes', assertNotSuspended: () => {},
} });
mock.module(u('services/service.attachment.js'), { namedExports: {
  commitAttachments: async (a, id, current, incoming) => ({ attachments: incoming.map((i, n) => current.find((c) => c.id === i.id) ?? { id: `A${++seq}`, path: `p/${n}`, name: i.name }), removed: [] }),
  deleteAttachments: async () => {}, deleteFolder: async () => {}, createUploadUrl: async (a, { contentType }) => ({ uploadUrl: `https://s3.test/${a}`, contentType }),
  withUrls: async (s) => s, recordFolder: (a, id) => `accounts/${a}/records/${id}/`,
} });
mock.module(u('services/service.email.js'), { namedExports: { sendEmail: async (e) => emails.push(e) } });
mock.module(u('services/service.accountAuth.js'), { namedExports: { getFormsUrl: () => 'https://forms.test', getFrontendUrl: () => 'https://dash.test' } });
mock.module(u('services/service.accountLookup.js'), { namedExports: { getAccountModel: () => ({ get: async () => ({ firstName: 'Loy', email: 'loy@acme.test' }) }) } });
mock.module(u('config/config.js'), { defaultExport: config });
mock.module(u('helpers/utils.js'), { defaultExport: { ulid: () => `CB${++seq}` } });
mock.module(u('services/index.js'), { namedExports: {
  getLambdaClient: () => ({ send: async (c) => { if (invokeFails) throw new Error('boom'); invokes.push(JSON.parse(c.input.Payload.toString())); } }),
  getS3Client: () => ({}),
} });
mock.module('@aws-sdk/client-lambda', { namedExports: { InvokeCommand: class { constructor(input) { this.input = input; } } } });
mock.module('@aws-sdk/client-s3', { namedExports: { GetObjectCommand: class { constructor(input) { this.input = input; } } } });
mock.module('@aws-sdk/s3-request-presigner', { namedExports: { getSignedUrl: async (c, cmd) => `https://s3.test/${cmd.input.Key}?${cmd.input.ResponseContentDisposition}` } });
mock.module(u('middlewares/error.js'), { namedExports: { errorType: {}, errorMessage: { NOT_FOUND: 'not found' }, ApiError } });

const forms_ = await import(u('services/service.form.js'));
const subm = await import(u('services/service.submission.js'));
const bl = { actionBy: { name: 'Alice' }, auditStreamId: 'x' };
const reset = () => { for (const k of Object.keys(forms)) delete forms[k]; for (const k of Object.keys(subs)) delete subs[k]; emails.length = 0; cloned.length = 0; invokes.length = 0; invokeFails = false; config.docx.lambdaName = 'fn'; limits = { formLimit: 2, submissionLimit: 3 }; };
const schema = () => JSON.parse(JSON.stringify(V.schema));
const publishedForm = async (settings = { publicEnabled: true }, acct = 'A1') => {
  const f = await forms_.createForm({ name: 'CDD', schema: schema(), settings }, acct, bl);
  return forms_.publishForm(f.id, acct, bl);
};
const goodAnswers = { full_name: 'Ann Lee', kind: 'ind', pep: false, owners: [{ name: 'O' }], checks: { q1: true, q2: false }, sign: { name: 'Ann Lee', consent: true }, risk: 'low' };

test('forms: invalid schemas are refused with a reason; the plan limit counts own forms only', async () => {
  reset();
  const bad = schema(); bad.sections[0].fields[1].key = 'full_name';
  await assert.rejects(forms_.createForm({ name: 'X', schema: bad }, 'A1', bl), /used twice/);
  await forms_.createForm({ name: 'One' }, 'A1', bl);
  await forms_.createForm({ name: 'Two' }, 'A1', bl);
  await assert.rejects(forms_.createForm({ name: 'Three' }, 'A1', bl), /includes 2 forms/);
  await forms_.createForm({ name: 'Other' }, 'A2', bl);
  await forms_.createForm({ name: 'Master' }, 'MASTER', bl); // masters are unlimited
});

test('publish: validates, needs a field, bumps the version; unpublish stops new submissions', async () => {
  reset();
  const empty = await forms_.createForm({ name: 'Empty' }, 'A1', bl);
  await assert.rejects(forms_.publishForm(empty.id, 'A1', bl), /at least one field/);
  const f = await publishedForm();
  assert.equal(f.status, 'published');
  assert.equal(f.version, 1);
  assert.equal((await forms_.publishForm(f.id, 'A1', bl)).version, 2);
  await forms_.unpublishForm(f.id, 'A1', bl);
  await assert.rejects(subm.createSubmission({ formId: f.id }, 'A1', bl), /Publish the form/);
  await assert.rejects(forms_.getForm(f.id, 'A2'), /not found/);
});

test('a submission snapshots the schema: editing the form later does not change it', async () => {
  reset();
  const f = await publishedForm();
  const s = await subm.createSubmission({ formId: f.id, title: 'Acme' }, 'A1', bl);
  assert.equal(s.formVersion, 1);
  assert.equal(s.schema.sections.length, 2);
  await forms_.updateForm({ id: f.id, schema: { sections: [{ id: 'z', title: 'Z', fields: [] }] } }, 'A1', bl);
  assert.equal((await subm.getSubmission(s.id, 'A1')).schema.sections.length, 2);
});

test('submission limit counts the account\'s submissions', async () => {
  reset();
  limits.submissionLimit = 1;
  const f = await publishedForm();
  await subm.createSubmission({ formId: f.id }, 'A1', bl);
  await assert.rejects(subm.createSubmission({ formId: f.id }, 'A1', bl), /includes 1 submissions/);
});

test('draft saves keep valid answers and report the rest; submit demands the required ones with a field list', async () => {
  reset();
  const f = await publishedForm();
  const s = await subm.createSubmission({ formId: f.id }, 'A1', bl);
  const saved = await subm.saveSubmission({ id: s.id, values: { full_name: 'Ann', age: 999, kind: 'ind' } }, 'A1', bl);
  assert.deepEqual(saved.values, { full_name: 'Ann', kind: 'ind' });
  assert.equal(saved.errors[0].key, 'age');
  await assert.rejects(subm.submit({ id: s.id }, 'A1', bl), (e) => e.statusCode === 422 && e.data.errors.some((x) => x.key === 'pep'));
  const done = await subm.submit({ id: s.id, values: goodAnswers }, 'A1', bl);
  assert.equal(done.status, 'submitted');
  assert.equal(done.submittedBy.name, 'Alice');
});

test('status flow: editing needs a draft; approve/reject only when submitted; reject needs a reason; reopen clears the decision', async () => {
  reset();
  const f = await publishedForm();
  const s = await subm.createSubmission({ formId: f.id }, 'A1', bl);
  await assert.rejects(subm.approve({ id: s.id }, 'A1', bl), /Only a submitted/);
  await subm.submit({ id: s.id, values: goodAnswers }, 'A1', bl);
  await assert.rejects(subm.saveSubmission({ id: s.id, values: { full_name: 'x' } }, 'A1', bl), /Reopen/);
  const rejected = await subm.reject({ id: s.id, comment: 'ID unclear' }, 'A1', bl);
  assert.equal(rejected.status, 'rejected');
  assert.equal(rejected.decisionComment, 'ID unclear');
  const draft = await subm.reopen(s.id, 'A1', bl);
  assert.equal(draft.status, 'draft');
  assert.ok(!draft.decisionComment);
  await subm.submit({ id: s.id }, 'A1', bl);
  assert.equal((await subm.approve({ id: s.id, comment: 'ok' }, 'A1', bl)).status, 'approved');
  await assert.rejects(subm.approve({ id: s.id }, 'A1', bl), /Only a submitted/);
  await assert.rejects(subm.getSubmission(s.id, 'A2'), /not found/);
});

test('a form with submissions can not be deleted; one without can', async () => {
  reset();
  const f = await publishedForm();
  const s = await subm.createSubmission({ formId: f.id }, 'A1', bl);
  await assert.rejects(forms_.deleteForm(f.id, 'A1', bl), /1 submission uses this form/);
  await subm.deleteSubmission(s.id, 'A1', bl);
  await forms_.deleteForm(f.id, 'A1', bl);
  assert.equal(forms[f.id], undefined);
});

test('cloning a master copies it as a draft and brings its output template along', async () => {
  reset();
  const m = await forms_.createForm({ name: 'CDD master', schema: schema() }, 'MASTER', bl);
  await forms_.updateForm({ id: m.id, templateId: 'T-master' }, 'MASTER', bl);
  const copy = await forms_.cloneForm(m.id, 'MASTER', 'A1', bl);
  assert.equal(copy.accountId, 'A1');
  assert.equal(copy.status, 'draft');
  assert.equal(copy.version, 0);
  assert.equal(copy.templateId, 'T-A1');
  assert.deepEqual(cloned, [{ id: 'T-master', from: 'MASTER', to: 'A1' }, { bind: { id: 'T-A1', formId: copy.id } }]);
  await assert.rejects(forms_.getForm(m.id, 'A1'), /not found/);
});

test('links: need the form setting, store only a hash, and email the customer when asked', async () => {
  reset();
  const off = await publishedForm({ publicEnabled: false });
  const s0 = await subm.createSubmission({ formId: off.id }, 'A1', bl);
  await assert.rejects(subm.createLink({ id: s0.id }, 'A1', bl), /customer links/);
  const f = await publishedForm();
  const s = await subm.createSubmission({ formId: f.id, title: 'Acme CDD' }, 'A1', bl);
  const link = await subm.createLink({ id: s.id, email: 'cust@x.test', expiresInDays: 7 }, 'A1', bl);
  const token = link.url.split('/f/')[1];
  assert.ok(token.length >= 40);
  assert.notEqual(subs[s.id].tokenHash, token);
  assert.equal(subs[s.id].tokenHash.length, 64);
  assert.ok(link.emailed && emails[0].to === 'cust@x.test' && emails[0].html.includes(token));
  assert.equal((await subm.getSubmission(s.id, 'A1')).link.active, true);
  assert.equal((await subm.getSubmission(s.id, 'A1')).tokenHash, undefined);
});

test('a customer sees no internal fields, cannot write them, and submitting stamps the signature and locks the link', async () => {
  reset();
  const f = await publishedForm();
  const s = await subm.createSubmission({ formId: f.id }, 'A1', bl);
  await subm.saveSubmission({ id: s.id, values: { risk: 'high' } }, 'A1', bl); // staff-entered, internal
  const { url } = await subm.createLink({ id: s.id }, 'A1', bl);
  const token = url.split('/f/')[1];
  const view = await subm.getPublic(token);
  assert.ok(!JSON.stringify(view).includes('"risk"'));
  assert.equal(view.schema.sections.length, 1);
  const cust = { actionBy: { name: 'Customer (link)' }, auditStreamId: 'c' };
  await subm.savePublic({ token, values: { full_name: 'Ann', risk: 'low' } }, cust);
  assert.equal(subs[s.id].values.risk, 'high'); // untouched
  assert.equal(subs[s.id].values.full_name, 'Ann');
  await assert.rejects(subm.submitPublic({ token, values: { kind: 'ind' } }, { ip: '1.2.3.4' }, cust), (e) => e.statusCode === 422);
  const out = await subm.submitPublic({ token, values: goodAnswers }, { ip: '1.2.3.4', clientInfo: { browser: 'Chrome' } }, cust);
  assert.equal(out.submitted, true);
  const final = subs[s.id];
  assert.equal(final.status, 'submitted');
  assert.equal(final.values.risk, 'high');
  assert.equal(final.signature.name, 'Ann Lee');
  assert.equal(final.signature.ip, '1.2.3.4');
  assert.equal(final.submittedBy.name, 'Customer (link)');
  await assert.rejects(subm.getPublic(token), /isn't valid or has expired/); // locked
});

test('links that are expired, revoked, unknown or on a reopened-by-someone-else draft all answer the same 404', async () => {
  reset();
  const f = await publishedForm();
  const s = await subm.createSubmission({ formId: f.id }, 'A1', bl);
  const { url } = await subm.createLink({ id: s.id }, 'A1', bl);
  const token = url.split('/f/')[1];
  subs[s.id].publicExpiresAt = new Date(Date.now() - 1000).toISOString();
  await assert.rejects(subm.getPublic(token), /isn't valid or has expired/);
  await assert.rejects(subm.getPublic('x'.repeat(43)), /isn't valid or has expired/);
  const again = await subm.createLink({ id: s.id }, 'A1', bl);
  await subm.revokeLink(s.id, 'A1', bl);
  await assert.rejects(subm.getPublic(again.url.split('/f/')[1]), /isn't valid or has expired/);
  await subm.createLink({ id: s.id }, 'A1', bl);
  await forms_.updateForm({ id: f.id, settings: { publicEnabled: false } }, 'A1', bl);
  await assert.rejects(subm.getPublic(token), /isn't valid or has expired/);
});

test('file fields: attachments are committed per field and the field value is the list of ids', async () => {
  reset();
  const sc = { sections: [{ id: 's1', title: 'Docs', fields: [{ id: 'f1', key: 'id_copy', type: 'file', label: 'ID copy', required: true }, { id: 'f2', key: 'name', type: 'text', label: 'Name' }] }] };
  const f = await forms_.createForm({ name: 'Docs', schema: sc }, 'A1', bl);
  await forms_.publishForm(f.id, 'A1', bl);
  const s = await subm.createSubmission({ formId: f.id }, 'A1', bl);
  await assert.rejects(subm.submit({ id: s.id, values: { name: 'x' } }, 'A1', bl), (e) => e.data.errors.some((x) => x.key === 'id_copy'));
  await assert.rejects(subm.saveSubmission({ id: s.id, attachments: [{ key: 'tmp/A1/X.pdf', name: 'a.pdf', fieldKey: 'name' }] }, 'A1', bl), /isn't a file field/);
  const saved = await subm.saveSubmission({ id: s.id, attachments: [{ key: 'tmp/A1/X.pdf', name: 'a.pdf', fieldKey: 'id_copy' }] }, 'A1', bl);
  assert.equal(saved.attachments[0].fieldKey, 'id_copy');
  assert.deepEqual(saved.values.id_copy, [saved.attachments[0].id]);
  assert.equal((await subm.submit({ id: s.id }, 'A1', bl)).status, 'submitted');
});

// ---- documents from a submission ------------------------------------------------------------------

const withTemplate = async (settings = { publicEnabled: true }) => {
  const f = await publishedForm(settings);
  await forms_.updateForm({ id: f.id, templateId: 'T-bound' }, 'A1', bl);
  return f;
};

test('generate: adds a processing entry and invokes the Lambda with just the submission and export ids', async () => {
  reset();
  const f = await withTemplate();
  const s = await subm.createSubmission({ formId: f.id, title: 'Acme' }, 'A1', bl);
  const out = await subm.generateExport({ id: s.id }, 'A1', bl);
  assert.equal(out.exportHistory.length, 1);
  assert.equal(out.exportHistory[0].processStatus, 'processing');
  assert.equal(out.exportHistory[0].createdBy.name, 'Alice');
  assert.deepEqual(invokes, [{ submissionId: s.id, cbId: out.exportHistory[0].cbId, pdf: false }]);
  assert.equal(out.exportHistory[0].url, undefined); // nothing to download yet
});

test('generate: a form without a template, a form needing approval, a missing Lambda and a full history are all refused', async () => {
  reset();
  limits.formLimit = 10;
  const bare = await publishedForm();
  const s0 = await subm.createSubmission({ formId: bare.id }, 'A1', bl);
  await assert.rejects(subm.generateExport({ id: s0.id }, 'A1', bl), /no document template yet/);

  const strict = await withTemplate({ publicEnabled: true, requireApprovedToExport: true });
  const s1 = await subm.createSubmission({ formId: strict.id }, 'A1', bl);
  await assert.rejects(subm.generateExport({ id: s1.id }, 'A1', bl), /Approve the submission before exporting/);
  await subm.submit({ id: s1.id, values: goodAnswers }, 'A1', bl);
  await subm.approve({ id: s1.id }, 'A1', bl);
  assert.equal((await subm.generateExport({ id: s1.id }, 'A1', bl)).exportHistory.length, 1); // approved: allowed

  const ok = await withTemplate();
  const s2 = await subm.createSubmission({ formId: ok.id }, 'A1', bl);
  config.docx.lambdaName = undefined;
  await assert.rejects(subm.generateExport({ id: s2.id }, 'A1', bl), /isn't set up/);
  config.docx.lambdaName = 'fn';
  subs[s2.id].exportHistory = Array.from({ length: 50 }, (_, i) => ({ cbId: `E${i}`, processStatus: 'completed' }));
  await assert.rejects(subm.generateExport({ id: s2.id }, 'A1', bl), /up to 50 exports/);
  await assert.rejects(subm.generateExport({ id: s2.id }, 'A2', bl), /not found/); // someone else's
});

test('generate: a failed invoke marks the entry failed and errors', async () => {
  reset();
  const f = await withTemplate();
  const s = await subm.createSubmission({ formId: f.id }, 'A1', bl);
  invokeFails = true;
  await assert.rejects(subm.generateExport({ id: s.id }, 'A1', bl), /Could not start/);
  assert.equal(subs[s.id].exportHistory[0].processStatus, 'failed');
  assert.match(subs[s.id].exportHistory[0].error, /Could not start/);
});

test('exports: only completed ones get a download link (and no storage path); deleting one removes its file', async () => {
  reset();
  const f = await withTemplate();
  const s = await subm.createSubmission({ formId: f.id, title: 'Acme: CDD' }, 'A1', bl);
  subs[s.id].exportHistory = [
    { cbId: 'C1', processStatus: 'completed', path: 'accounts/A1/records/x/exports/C1.docx' },
    { cbId: 'C2', processStatus: 'processing' },
    { cbId: 'C3', processStatus: 'failed', error: 'x', path: 'accounts/A1/records/x/exports/C3.docx' },
  ];
  const got = await subm.getSubmission(s.id, 'A1');
  assert.match(got.exportHistory[0].url, /accounts\/A1\/records\/x\/exports\/C1\.docx\?attachment; filename="Acme_ CDD\.docx"/);
  assert.equal(got.exportHistory[0].path, undefined);
  assert.equal(got.exportHistory[1].url, undefined);
  assert.equal(got.exportHistory[2].url, undefined);
  assert.equal(got.exportHistory[2].path, undefined);
  const after = await subm.deleteExport(s.id, 'C1', 'A1', bl);
  assert.deepEqual(after.exportHistory.map((h) => h.cbId), ['C2', 'C3']);
  await assert.rejects(subm.deleteExport(s.id, 'nope', 'A1', bl), /not found/);
});
