// Form engine (src/helpers/formEngine.js) against test/formEngine.vectors.json. The same vectors are
// run against the Lambda and dashboard copies of the engine.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as E from '../src/helpers/formEngine.js';

const V = JSON.parse(readFileSync(new URL('./formEngine.vectors.json', import.meta.url), 'utf8'));
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

test('publicSchema/publicValues hide internal fields and empty sections', () => {
  const p = E.publicSchema(V.schema);
  assert.equal(p.sections.length, 1);
  assert.ok(!JSON.stringify(p).includes('"risk"'));
  assert.deepEqual(E.publicValues(V.schema, { full_name: 'A', risk: 'low' }), { full_name: 'A' });
});

test('evalCond: all / any / in / empty / gt', () => {
  assert.equal(E.evalCond({ all: [{ key: 'a', op: 'eq', value: 1 }, { key: 'b', op: 'notEmpty' }] }, { a: '1', b: 'x' }), true);
  assert.equal(E.evalCond({ any: [{ key: 'a', op: 'in', value: ['x', 'y'] }, { key: 'b', op: 'gt', value: 5 }] }, { a: 'z', b: 3 }), false);
  assert.equal(E.evalCond({ key: 'm', op: 'eq', value: 'a' }, { m: ['a', 'b'] }), true); // multiselect contains
  assert.equal(E.evalCond({ key: 'x', op: 'empty' }, {}), true);
});
