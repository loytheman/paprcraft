// The design-system copy of the form engine (frontend/design-system/lib/forms.js) against the same
// vectors as the API's (backend/api/test/formEngine.vectors.json), so the copies can't drift apart.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as E from '../../design-system/lib/forms.js';

const V = JSON.parse(readFileSync(new URL('../../../backend/api/test/formEngine.vectors.json', import.meta.url), 'utf8'));
const clone = (x) => JSON.parse(JSON.stringify(x));
const id = (e) => `${e.key}|${e.row ?? ''}|${e.field ?? ''}`;
const sortErrs = (e) => [...e].sort((a, b) => id(a).localeCompare(id(b)));

for (const c of V.normalize) {
  test(`normalize: ${c.name}`, () => {
    const r = E.normalizeValues(V.schema, c.input, { mode: c.mode, audience: c.audience, existing: c.existing });
    assert.deepEqual(r.values, c.values);
    assert.deepEqual(sortErrs(r.errors), sortErrs(c.errors));
  });
}

const mutations = {
  dupKey: (s) => { s.sections[0].fields[1].key = 'full_name'; },
  forwardRef: (s) => { s.sections[0].fields[0].visibleIf = { key: 'kind', op: 'eq', value: 'co' }; },
  internalDep: (s) => { s.sections[1].fields.push({ id: 'x1', key: 'follow_up', type: 'text', label: 'Follow up', visibleIf: { key: 'risk', op: 'eq', value: 'high' } }); },
  noOptions: (s) => { s.sections[0].fields[3].options = []; },
  nestedGroup: (s) => { s.sections[0].fields[6].group.fields.push({ id: 'g9', key: 'inner', type: 'group', label: 'Inner', group: { fields: [{ id: 'h1', key: 'z', type: 'text', label: 'Z' }] } }); },
};
for (const c of V.validate) {
  test(`validateSchema: ${c.name}`, () => {
    const s = clone(V.schema);
    if (c.mutate) mutations[c.mutate](s);
    const errors = E.validateSchema(s);
    if (c.contains) assert.ok(errors.some((e) => e.includes(c.contains)), `expected "${c.contains}" in ${JSON.stringify(errors)}`);
    else assert.deepEqual(errors, c.errors);
  });
}

test('flatten: selects become labels, groups keep rows, signature is the name', () => {
  assert.deepEqual(E.flatten(V.schema, V.flatten.values).data, V.flatten.data);
});

test('the design-system copy is byte-for-byte the API engine', () => {
  const api = readFileSync(new URL('../../../backend/api/src/helpers/formEngine.js', import.meta.url), 'utf8');
  const ds = readFileSync(new URL('../../design-system/lib/forms.js', import.meta.url), 'utf8');
  assert.equal(ds, api);
});
