// Data sources (src/services/service.valueSet.js): ownership, unique names, reserved placeholder
// keys, and the values an export gets. In-memory fakes.
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
const u = (p) => new URL('../src/' + p, import.meta.url).href;

const db = {};
let seq = 0;
const model = {
  create: async (d) => (db[`V${++seq}`] = { ...d, id: `V${seq}` }),
  getById: async (id) => db[id] ?? null,
  getAllForAccount: async (a) => Object.values(db).filter((s) => s.accountId === a),
  update: async (d) => (db[d.id] = { ...db[d.id], ...d }),
  remove: async (id) => { delete db[id]; },
};
mock.module(u('models/model.valueSet.js'), {
  namedExports: { MAX_VALUE_SETS: 3, RESERVED_KEYS: ['submission_ref', 'submission_title', 'generated_date', 'form_name'] },
  defaultExport: model,
});
mock.module(u('middlewares/error.js'), { namedExports: {
  errorType: {}, errorMessage: { NOT_FOUND: 'not found' },
  ApiError: class extends Error { constructor(s, c, m) { super(m); this.statusCode = s; } },
} });

const svc = await import(u('services/service.valueSet.js'));
const reset = () => { for (const k of Object.keys(db)) delete db[k]; seq = 0; };

test('names are unique per account ignoring case; another account may reuse one; the limit holds', async () => {
  reset();
  await svc.createValueSet({ name: 'Acme', values: {} }, 'A1');
  await assert.rejects(svc.createValueSet({ name: 'ACME' }, 'A1'), /already have a data source called/);
  await svc.createValueSet({ name: 'Acme' }, 'A2');
  await svc.createValueSet({ name: 'Beta' }, 'A1');
  await svc.createValueSet({ name: 'Gamma' }, 'A1');
  await assert.rejects(svc.createValueSet({ name: 'Delta' }, 'A1'), /up to 3 data sources/);
  assert.deepEqual((await svc.listValueSets('A1')).map((s) => s.name), ['Acme', 'Beta', 'Gamma']);
});

test('reserved keys are refused on create and update, in any case', async () => {
  reset();
  await assert.rejects(svc.createValueSet({ name: 'Acme', values: { GENERATED_DATE: 'x', COMPANY: 'Acme' } }, 'A1'), /GENERATED_DATE is reserved/);
  const s = await svc.createValueSet({ name: 'Acme', values: { COMPANY: 'Acme' } }, 'A1');
  await assert.rejects(svc.updateValueSet({ id: s.id, values: { submission_ref: 'x', Form_Name: 'y' } }, 'A1'), /submission_ref, Form_Name are reserved/);
  const out = await svc.updateValueSet({ id: s.id, name: 'Acme Pte Ltd' }, 'A1'); // no values: only the name changes
  assert.deepEqual([out.name, out.values], ['Acme Pte Ltd', { COMPANY: 'Acme' }]);
});

test('another account\'s data source is not found; export values merge the set under the request\'s, without reserved keys', async () => {
  reset();
  const s = await svc.createValueSet({ name: 'Acme', values: { COMPANY: 'Acme', CITY: 'SG' } }, 'A1');
  await assert.rejects(svc.updateValueSet({ id: s.id, name: 'x' }, 'A2'), /not found/);
  await assert.rejects(svc.deleteValueSet(s.id, 'A2'), /not found/);
  db[s.id].values.generated_date = 'stale'; // saved before the reserved check existed
  assert.deepEqual(await svc.exportValues(s.id, 'A1', { CITY: 'KL' }), { COMPANY: 'Acme', CITY: 'KL' });
  assert.deepEqual(await svc.exportValues(null, 'A1', { CITY: 'KL' }), { CITY: 'KL' });
  await assert.rejects(svc.exportValues(s.id, 'A2'), /no longer exists/);
  await svc.deleteValueSet(s.id, 'A1');
  await assert.rejects(svc.exportValues(s.id, 'A1'), /no longer exists/);
});
