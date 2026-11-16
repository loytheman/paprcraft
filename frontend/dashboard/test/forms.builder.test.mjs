// Form builder helpers (src/helpers/forms/builder.js): keys and slugs, factories, moves that keep
// conditions pointing at earlier fields, condition editing, reference rewriting.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as B from '../src/helpers/forms/builder.js';

const schemaOf = () => {
  const s = { sections: [{ id: 'a', title: 'One', fields: [] }, { id: 'b', title: 'Two', fields: [] }] };
  const keys = new Set();
  const add = (si, type, label) => { const f = B.newField(type, keys, label); keys.add(f.key); s.sections[si].fields.push(f); return f; };
  return { s, add, keys };
};

test('slugify makes valid keys from any label', () => {
  assert.equal(B.slugify('Date of birth'), 'date_of_birth');
  assert.equal(B.slugify('  Né(e) à Zürich! '), 'ne_e_a_zurich');
  assert.equal(B.slugify('123 items'), 'f_123_items');
  assert.equal(B.slugify('???'), 'field');
  assert.equal(B.slugify('x'.repeat(100)).length, 60);
  for (const l of ['Full name', '1st', 'a b', '😀', 'A'.repeat(80)]) assert.match(B.slugify(l), B.KEY_RE);
});

test('uniqueKey adds a numeric suffix and stays within 60 characters', () => {
  assert.equal(B.uniqueKey('Name', new Set()), 'name');
  assert.equal(B.uniqueKey('Name', new Set(['name'])), 'name_2');
  assert.equal(B.uniqueKey('Name', new Set(['name', 'name_2'])), 'name_3');
  const long = 'k'.repeat(60);
  const k = B.uniqueKey(long, new Set([long]));
  assert.ok(k.length <= 60 && k !== long && B.KEY_RE.test(k));
});

test('new fields get unique ids and keys, and sensible defaults per type', () => {
  const { s, add, keys } = schemaOf();
  const a = add(0, 'text', 'Full name');
  const b = add(0, 'text', 'Full name');
  assert.deepEqual([a.key, b.key], ['full_name', 'full_name_2']);
  assert.notEqual(a.id, b.id);
  const sel = B.newField('select', keys);
  assert.equal(sel.options.length, 2);
  const grp = B.newField('group', keys);
  assert.equal(grp.group.fields.length, 1);
  assert.equal(grp.group.fields[0].type, 'text');
  assert.equal(B.newField('signature', keys).required, true);
  assert.throws(() => B.newField('nope', keys), /Unknown field type/);
  assert.equal(B.validateSchema(s).length, 0);
});

test('every field type produces a schema the engine accepts', () => {
  const { s, add } = schemaOf();
  for (const t of B.FIELD_TYPES) add(0, t);
  assert.deepEqual(B.validateSchema(s), []);
});

test('relabel keeps an automatic key in step, and leaves a hand-edited key alone', () => {
  const { s, add, keys } = schemaOf();
  const f = add(0, 'text', 'Name');
  const others = new Set([...keys].filter((k) => k !== f.key));
  assert.equal(B.relabel(f, 'Full name', others), 'name'); // returns the old key
  assert.equal(f.key, 'full_name');
  f.key = 'custom_key';
  assert.equal(B.relabel(f, 'Something else', others), null);
  assert.equal(f.key, 'custom_key');
  assert.equal(f.label, 'Something else');
  assert.equal(B.validateSchema(s).length, 0);
});

test('keyProblem flags a bad or taken key', () => {
  assert.equal(B.keyProblem('good_key', new Set()), '');
  assert.match(B.keyProblem('Bad Key', new Set()), /lower case/);
  assert.match(B.keyProblem('taken', new Set(['taken'])), /already uses/);
});

test('scopeKeys: top level excludes the field itself; inside a group it is the siblings', () => {
  const { s, add } = schemaOf();
  const a = add(0, 'text', 'A');
  const g = add(0, 'group', 'Owners');
  g.group.fields.push(B.newField('text', new Set(['name']), 'Pct'));
  const top = B.scopeKeys(s, { s: 0, f: 0 });
  assert.ok(!top.has(a.key) && top.has(g.key));
  const inner = B.scopeKeys(s, { s: 0, f: 1, g: 0 });
  assert.deepEqual([...inner], ['pct']);
});

test('cloneField and cloneSection re-id, free the keys, and repoint conditions inside the copy', () => {
  const { s, add, keys } = schemaOf();
  const kind = add(1, 'select', 'Kind');
  const co = add(1, 'text', 'Company');
  co.visibleIf = { key: kind.key, op: 'eq', value: 'option_1' };
  const copy = B.cloneField(co, keys);
  assert.equal(copy.key, 'company_2');
  assert.notEqual(copy.id, co.id);
  assert.equal(copy.label, 'Company (copy)');
  const sec = B.cloneSection(s, 1);
  assert.notEqual(sec.id, s.sections[1].id);
  assert.deepEqual(sec.fields.map((f) => f.key), ['kind_2', 'company_2']);
  assert.deepEqual(sec.fields[1].visibleIf, { key: 'kind_2', op: 'eq', value: 'option_1' });
  s.sections.push(sec);
  assert.deepEqual(B.validateSchema(s), []);
});

test('moveChecked refuses a move that leaves a condition looking at a later field, and puts the list back', () => {
  const { s, add } = schemaOf();
  const a = add(0, 'select', 'Kind');
  const b = add(0, 'text', 'Company');
  b.visibleIf = { key: a.key, op: 'eq', value: 'option_1' };
  const pick = (sc) => sc.sections[0].fields;
  const r = B.moveChecked(s, pick, 0, 1); // Kind below Company
  assert.equal(r.ok, false);
  assert.match(r.reason, /earlier field/);
  assert.deepEqual(s.sections[0].fields.map((f) => f.key), ['kind', 'company']);
  add(0, 'text', 'Other');
  assert.equal(B.moveChecked(s, pick, 2, 0).ok, true); // an unrelated field can move anywhere
  assert.equal(s.sections[0].fields[0].key, 'other');
  assert.equal(B.moveChecked(s, pick, 0, 9).ok, false); // out of range is a no-op
});

test('moving a whole section is checked too', () => {
  const { s, add } = schemaOf();
  const a = add(0, 'yesno', 'Is PEP');
  const b = add(1, 'text', 'Why');
  b.visibleIf = { key: a.key, op: 'eq', value: true };
  const r = B.moveChecked(s, (sc) => sc.sections, 0, 1);
  assert.equal(r.ok, false);
  assert.deepEqual(s.sections.map((x) => x.id), ['a', 'b']);
});

test('conditionSources: earlier fields only, no signatures, no internal ones for a customer-visible subject', () => {
  const { s, add } = schemaOf();
  add(0, 'text', 'First');
  const officer = add(0, 'select', 'Officer risk'); officer.internal = true;
  add(0, 'signature', 'Sign');
  add(1, 'text', 'Second');
  add(1, 'text', 'Third');
  const keysOf = (list) => list.map((f) => f.key);
  assert.deepEqual(keysOf(B.conditionSources(s, { s: 1, f: 1 })), ['first', 'second']);
  assert.deepEqual(keysOf(B.conditionSources(s, { s: 1, f: 1 }, { subjectInternal: true })), ['first', 'officer_risk', 'second']);
  assert.deepEqual(keysOf(B.conditionSources(s, { s: 1 })), ['first']); // a section looks at earlier sections only
  assert.deepEqual(keysOf(B.conditionSources(s, { s: 0, f: 0 })), []);
});

test('groupConditionSources looks at earlier simple fields of the same row', () => {
  const g = B.newField('group', new Set());
  g.group.fields.push(B.newField('select', new Set(['name']), 'Role'), B.newField('text', new Set(['name', 'role']), 'Note'));
  assert.deepEqual(B.groupConditionSources(g.group, 2).map((f) => f.key), ['name', 'role']);
  assert.deepEqual(B.groupConditionSources(g.group, 0), []);
});

test('condition rows round trip: none, one, all, any, and nested trees are flagged complex', () => {
  assert.deepEqual(B.condToRows(undefined), { mode: 'all', rows: [], complex: false });
  const one = { key: 'a', op: 'eq', value: 1 };
  assert.deepEqual(B.condToRows(one).rows, [one]);
  assert.deepEqual(B.rowsToCond('all', []), undefined);
  assert.deepEqual(B.rowsToCond('any', [one]), one);
  const two = B.rowsToCond('any', [one, { key: 'b', op: 'empty' }]);
  assert.deepEqual(two, { any: [one, { key: 'b', op: 'empty' }] });
  assert.equal(B.condToRows(two).mode, 'any');
  const nested = { all: [one, { any: [one, one] }] };
  assert.equal(B.condToRows(nested).complex, true);
});

test('newCondition and coerceConditionValue use the right operator and value types', () => {
  const sel = B.newField('select', new Set());
  const c = B.newCondition(sel);
  assert.deepEqual(c, { key: sel.key, op: 'eq', value: 'option_1' });
  const yn = B.newField('yesno', new Set());
  assert.equal(B.newCondition(yn).value, true);
  assert.equal(B.coerceConditionValue(yn, 'eq', 'false'), false);
  assert.equal(B.coerceConditionValue({ type: 'number' }, 'gt', '5'), 5);
  assert.deepEqual(B.coerceConditionValue(sel, 'in', 'a, b ,'), ['a', 'b']);
  assert.equal(B.coerceConditionValue(sel, 'empty', 'x'), undefined);
  assert.deepEqual(B.opsFor('group'), ['empty', 'notEmpty']);
  assert.ok(B.opsFor('number').includes('gt'));
  assert.ok(!B.opsFor('yesno').includes('gt'));
});

test('renaming or deleting a key rewrites or drops the conditions that looked at it', () => {
  const { s, add } = schemaOf();
  const a = add(0, 'yesno', 'Is PEP');
  const b = add(0, 'text', 'Why');
  b.visibleIf = { all: [{ key: a.key, op: 'eq', value: true }, { key: 'other', op: 'empty' }] };
  const c = add(1, 'text', 'Detail');
  c.visibleIf = { key: a.key, op: 'eq', value: true };
  s.sections[1].visibleIf = { key: a.key, op: 'eq', value: true };
  assert.deepEqual(B.dependents(s, a.key).sort(), ['Detail', 'Two', 'Why']);
  B.renameKeyRefs(s, a.key, 'pep');
  assert.equal(s.sections[1].visibleIf.key, 'pep');
  assert.equal(b.visibleIf.all[0].key, 'pep');
  const n = B.dropKeyRefs(s, 'pep');
  assert.equal(n, 3);
  assert.deepEqual(b.visibleIf, { key: 'other', op: 'empty' }); // one row left collapses
  assert.equal(c.visibleIf, undefined);
  assert.equal(s.sections[1].visibleIf, undefined);
});

test('describeCondition reads like a sentence, with option labels', () => {
  const { s, add } = schemaOf();
  const k = add(0, 'select', 'Kind');
  k.options = [{ value: 'ind', label: 'Individual' }, { value: 'co', label: 'Company' }];
  assert.equal(B.describeCondition({ key: 'kind', op: 'eq', value: 'co' }, s), 'Kind is Company');
  assert.equal(B.describeCondition({ any: [{ key: 'kind', op: 'in', value: ['ind', 'co'] }, { key: 'kind', op: 'empty' }] }, s), 'Kind is one of Individual, Company or Kind is empty');
});

test('ensureIds fills missing and duplicate ids, and gives an empty schema one section', () => {
  const s = B.ensureIds({ sections: [{ title: 'X', fields: [{ key: 'a', type: 'text', label: 'A' }, { id: 'dup', key: 'b', type: 'text', label: 'B' }, { id: 'dup', key: 'c', type: 'text', label: 'C' }] }] });
  const ids = [s.sections[0].id, ...s.sections[0].fields.map((f) => f.id)];
  assert.equal(new Set(ids).size, 4);
  assert.equal(B.ensureIds(undefined).sections.length, 1);
});

test('formSignature changes with any saved part, and keyChanges reports added and removed keys', () => {
  const { s, add } = schemaOf();
  add(0, 'text', 'A');
  const f = { name: 'N', schema: s, settings: {}, templateId: '' };
  const sig = B.formSignature(f);
  assert.equal(B.formSignature({ ...f }), sig);
  assert.notEqual(B.formSignature({ ...f, name: 'M' }), sig);
  assert.notEqual(B.formSignature({ ...f, settings: { publicEnabled: true } }), sig);
  const before = JSON.parse(JSON.stringify(s));
  add(0, 'text', 'B');
  s.sections[0].fields.shift();
  assert.deepEqual(B.keyChanges(before, s), { removed: ['a'], added: ['b'] });
});

test('option helpers: new options and values from labels stay unique', () => {
  const opts = [{ value: 'option_1', label: 'Option 1' }];
  assert.deepEqual(B.newOption(opts), { value: 'option_2', label: 'Option 2' });
  assert.equal(B.optionValueFor('Option 1', opts, null), 'option_1_2');
  assert.equal(B.optionValueFor('Option 1', opts, opts[0]), 'option_1');
  assert.equal(B.optionValueFor('Yes, sure', opts, opts[0]), 'yes_sure');
});

test('changeType keeps the label and key, drops what no longer applies, and gives the new type what it needs', () => {
  const f = B.newField('text', new Set(), 'Role');
  f.maxLength = 50;
  assert.equal(B.changeType(f, 'select'), true);
  assert.equal(f.type, 'select');
  assert.equal(f.maxLength, undefined);
  assert.equal(f.options.length, 2);
  assert.equal(f.key, 'role');
  f.options[0].label = 'Mine';
  B.changeType(f, 'multiselect'); // option types keep their options
  assert.equal(f.options[0].label, 'Mine');
  B.changeType(f, 'text');
  assert.equal(f.options, undefined);
  B.changeType(f, 'group');
  assert.equal(f.group.fields.length, 1);
  assert.equal(B.changeType(f, 'signature', { inGroup: true }), false); // not allowed inside a group
  assert.equal(B.changeType(f, 'nope'), false);
  assert.deepEqual(B.validateSchema({ sections: [{ id: 's', title: 'S', fields: [f] }] }), []);
});
