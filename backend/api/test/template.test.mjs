// Document templates (src/services/service.template.js): ownership, plan limit, masters and
// cloning, the export flow (processing entry + async Lambda invoke, failure marking). In-memory fakes.
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
const u = (p) => new URL('../src/' + p, import.meta.url).href;

const db = {};
const invokes = [];
const deleted = [];
let seq = 0;
let limit = 2;
let invokeFails = false;
const config = { aws: { s3Bucket: 'b' }, docx: { lambdaName: 'fn' } };

const model = {
  create: async (d) => (db[`T${++seq}`] = { id: `T${seq}`, updatedAt: String(seq), ...d }),
  getById: async (id) => db[id] ?? null,
  getAllForAccount: async (a) => Object.values(db).filter((t) => t.accountId === a),
  update: async (d) => (db[d.id] = { ...db[d.id], ...d }),
  remove: async (id) => { delete db[id]; },
  addExport: async (id, entry) => (db[id] = { ...db[id], exportHistory: [...(db[id].exportHistory ?? []), entry] }),
};
mock.module(u('models/model.template.js'), {
  namedExports: { MASTER_ACCOUNT_ID: 'MASTER', exportStatus: { PROCESSING: 'processing', COMPLETED: 'completed', FAILED: 'failed' } },
  defaultExport: model,
});
mock.module(u('config/config.js'), { defaultExport: config });
mock.module(u('helpers/utils.js'), { defaultExport: { ulid: () => `CB${++seq}` } });
mock.module(u('services/index.js'), { namedExports: {
  getLambdaClient: () => ({ send: async (c) => { if (invokeFails) throw new Error('boom'); invokes.push(JSON.parse(c.input.Payload.toString())); } }),
  getS3Client: () => ({}),
} });
mock.module('@aws-sdk/client-lambda', { namedExports: { InvokeCommand: class { constructor(input) { this.input = input; } } } });
mock.module('@aws-sdk/client-s3', { namedExports: { GetObjectCommand: class { constructor(input) { this.input = input; } } } });
mock.module('@aws-sdk/s3-request-presigner', { namedExports: { getSignedUrl: async (c, cmd) => `https://s3.test/${cmd.input.Key}` } });
mock.module(u('services/service.plan.js'), { namedExports: {
  getAccountPlan: async () => ({ templateLimit: limit, name: 'Free', key: 'free' }),
  planLimitError: (m) => Object.assign(new Error(m), { statusCode: 402 }),
  isTopPlan: () => false,
  includesText: () => 'Your Free plan includes',
  assertNotSuspended: () => {},
} });
mock.module(u('services/service.attachment.js'), { namedExports: { deleteFolder: async (p) => deleted.push(p) } });
mock.module(u('middlewares/error.js'), { namedExports: {
  errorType: {}, errorMessage: { NOT_FOUND: 'not found' },
  ApiError: class extends Error { constructor(s, c, m) { super(m); this.statusCode = s; } },
} });

const svc = await import(u('services/service.template.js'));
const reset = () => { for (const k of Object.keys(db)) delete db[k]; invokes.length = 0; deleted.length = 0; limit = 2; invokeFails = false; config.docx.lambdaName = 'fn'; };

test('create: blank first section, keyword search, plan limit counts own templates only', async () => {
  reset();
  const t = await svc.createTemplate({ name: 'AGM Notice' }, 'A1');
  assert.deepEqual(t.section, [{ name: 'section 1', list: [] }]);
  assert.equal(t.keywordSearch, 'agm notice');
  await svc.createTemplate({ name: 'Two' }, 'A1');
  await assert.rejects(svc.createTemplate({ name: 'Three' }, 'A1'), /includes 2 templates/);
  await svc.createTemplate({ name: 'Other account' }, 'A2'); // someone else's don't count
  await svc.createTemplate({ name: 'Master one' }, 'MASTER'); // masters are unlimited
});

test("someone else's template is a 404, for read, update, delete and export", async () => {
  reset();
  const t = await svc.createTemplate({ name: 'Mine' }, 'A1');
  await assert.rejects(svc.getTemplate(t.id, 'A2'), /not found/);
  await assert.rejects(svc.updateTemplate({ id: t.id, name: 'x' }, 'A2'), /not found/);
  await assert.rejects(svc.deleteTemplate(t.id, 'A2'), /not found/);
  await assert.rejects(svc.generateExport({ id: t.id }, 'A2'), /not found/);
});

test('masters are separate from accounts; cloning copies content, not history, and counts toward the limit', async () => {
  reset();
  const m = await svc.createTemplate({ name: 'Master AGM', section: [{ name: 'notice', list: [{ id: 'b1', type: 'paragraph' }] }], placeholders: { COMPANY: 'x' } }, 'MASTER');
  assert.equal((await svc.listTemplates('A1')).length, 0);
  assert.equal((await svc.listTemplates('MASTER')).length, 1);
  await assert.rejects(svc.getTemplate(m.id, 'A1'), /not found/); // accounts read masters via the clone, not by id
  const copy = await svc.cloneTemplate(m.id, 'MASTER', 'A1');
  assert.equal(copy.accountId, 'A1');
  assert.equal(copy.name, 'Master AGM');
  assert.deepEqual(copy.section, m.section);
  assert.deepEqual(copy.exportHistory, []);
  const dup = await svc.cloneTemplate(copy.id, 'A1', 'A1');
  assert.equal(dup.name, 'Master AGM (copy)');
  await assert.rejects(svc.cloneTemplate(copy.id, 'A1', 'A1'), /includes 2 templates/);
});

test('generate: adds a processing entry and invokes the Lambda with ids and values only', async () => {
  reset();
  const t = await svc.createTemplate({ name: 'Doc' }, 'A1');
  const out = await svc.generateExport({ id: t.id, values: { COMPANY: 'Acme' } }, 'A1', { actionBy: { name: 'Alice' } });
  assert.equal(out.exportHistory.length, 1);
  assert.equal(out.exportHistory[0].processStatus, 'processing');
  assert.equal(out.exportHistory[0].createdBy.name, 'Alice');
  assert.deepEqual(invokes, [{ templateId: t.id, cbId: out.exportHistory[0].cbId, values: { COMPANY: 'Acme' }, pdf: false }]);
});

test('generate: pdf true is remembered on the entry and passed to the Lambda', async () => {
  reset();
  const t = await svc.createTemplate({ name: 'Doc' }, 'A1');
  const out = await svc.generateExport({ id: t.id, values: {}, pdf: true }, 'A1', { actionBy: { name: 'Alice' } });
  assert.equal(out.exportHistory[0].pdf, true);
  assert.equal(invokes[0].pdf, true);
});

test('generate: a failed invoke marks the entry failed and errors; masters and missing setup are refused', async () => {
  reset();
  const t = await svc.createTemplate({ name: 'Doc' }, 'A1');
  invokeFails = true;
  await assert.rejects(svc.generateExport({ id: t.id }, 'A1'), /Could not start/);
  assert.equal(db[t.id].exportHistory[0].processStatus, 'failed');
  invokeFails = false;
  await assert.rejects(svc.generateExport({ id: 'x' }, 'MASTER'), /Clone one first/);
  config.docx.lambdaName = undefined;
  await assert.rejects(svc.generateExport({ id: t.id }, 'A1'), /isn't set up/);
});

test('completed exports get a download link, storage paths stay server-side; deleting one removes its file', async () => {
  reset();
  const t = await svc.createTemplate({ name: 'My Doc' }, 'A1');
  db[t.id].exportHistory = [
    { cbId: 'C1', processStatus: 'completed', path: 'accounts/A1/templates/x/exports/C1.docx' },
    { cbId: 'C2', processStatus: 'processing' },
  ];
  const got = await svc.getTemplate(t.id, 'A1');
  assert.equal(got.exportHistory[0].url, 'https://s3.test/accounts/A1/templates/x/exports/C1.docx');
  assert.equal(got.exportHistory[0].path, undefined);
  assert.equal(got.exportHistory[1].url, undefined);
  await svc.deleteExport(t.id, 'C1', 'A1');
  assert.deepEqual(deleted, ['accounts/A1/templates/x/exports/C1.docx']);
  assert.equal(db[t.id].exportHistory.length, 1);
  await assert.rejects(svc.deleteExport(t.id, 'nope', 'A1'), /not found/);
});

test('delete removes the template and its folder (not for masters)', async () => {
  reset();
  const t = await svc.createTemplate({ name: 'Doc' }, 'A1');
  await svc.deleteTemplate(t.id, 'A1');
  assert.equal(db[t.id], undefined);
  assert.deepEqual(deleted, [`accounts/A1/templates/${t.id}/`]);
  deleted.length = 0;
  const m = await svc.createTemplate({ name: 'M' }, 'MASTER');
  await svc.deleteTemplate(m.id, 'MASTER');
  assert.deepEqual(deleted, []);
});
