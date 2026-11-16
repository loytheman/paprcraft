// Template editor + forms: repeat / if containers, form fields as chips ("key|pipe"), the field picker,
// conditions, the table's repeatGroup. Pure helpers (src/helpers/template/blocks.js), no Vue or Quill.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as B from '../src/helpers/template/blocks.js';

const cell = (ops, text = '') => ({ text, delta: { ops } });
const chip = (text, value = '') => ({ insert: { text, value }, attributes: { placeholder: true } });
const para = (ops) => ({ id: B.uid(), type: 'paragraph', item: cell(ops) });
const SCHEMA = {
  sections: [
    { id: 's1', title: 'Customer', fields: [
      { id: 'a', key: 'full_name', label: 'Full name', type: 'text' },
      { id: 'b', key: 'dob', label: 'Date of birth', type: 'date' },
      { id: 'c', key: 'pep', label: 'PEP?', type: 'yesno' },
      { id: 'd', key: 'country', label: 'Country', type: 'country' },
      { id: 'e', key: 'services', label: 'Services', type: 'multiselect', options: [{ value: 'a', label: 'A' }] },
      { id: 'f', key: 'checks', label: 'Checks', type: 'checklist', options: [{ value: 'q1', label: 'Q1' }] },
      { id: 'g', key: 'id_copy', label: 'ID copy', type: 'file' },
      { id: 'h', key: 'owners', label: 'Owners', type: 'group', group: { fields: [{ id: 'g1', key: 'name', label: 'Name', type: 'text' }, { id: 'g2', key: 'since', label: 'Since', type: 'date' }] } },
    ] },
    { id: 's2', title: 'Officer', fields: [{ id: 'r', key: 'risk', label: 'Risk', type: 'select', options: [{ value: 'low', label: 'Low' }] }] },
  ],
};

test('containers: a repeat and an if start with one empty paragraph, and take their settings', () => {
  const r = B.newContainer('repeat', { group: 'owners' });
  assert.equal(r.type, 'repeat');
  assert.equal(r.item.group, 'owners');
  assert.equal(r.item.list.length, 1);
  assert.equal(r.item.list[0].type, 'paragraph');
  const cond = { key: 'pep', op: 'eq', value: true };
  const i = B.newContainer('if', { cond });
  assert.deepEqual(i.item.cond, cond);
  assert.ok(B.isContainer(r) && B.isContainer(i) && !B.isContainer({ type: 'repeat', item: {} }));
  assert.equal(B.childList(r), r.item.list);
});

test('trees: ids, paths, clones and walks reach into containers and lists inside them', () => {
  const inner = para([{ insert: 'x\n' }]);
  const list = { type: 'list', item: [{ type: 'list-item-paragraph', item: cell([{ insert: 'li\n' }]) }] };
  const rep = B.newContainer('repeat', { group: 'owners' });
  rep.item.list = [inner, list];
  const top = [para([{ insert: 'a\n' }]), rep];
  delete list.id; delete list.item[0].id;
  B.ensureIds(top);
  assert.ok(list.id && list.item[0].id);
  assert.deepEqual(B.findPath(top, inner.id), [1, 0]);
  assert.deepEqual(B.findPath(top, list.item[0].id), [1, 1, 0]);
  assert.equal(B.blockAt(top, [1, 1, 0]), list.item[0]);
  assert.deepEqual(B.pathBlocks(top, list.item[0].id).map((b) => b.type), ['repeat', 'list', 'list-item-paragraph']);
  const copy = B.cloneBlock(rep);
  const ids = new Set();
  B.forEachBlock([rep, copy], (b) => ids.add(b.id));
  assert.equal(ids.size, 8); // 4 blocks each (repeat, paragraph, list, list item), none shared
  let cells = 0;
  B.forEachCell(top, () => cells++);
  assert.equal(cells, 3);
});

test('insertAfterFocus: a focused container takes the block inside; text goes beside the focus; page breaks stay top level', () => {
  const rep = B.newContainer('repeat', { group: 'owners' });
  const first = rep.item.list[0];
  const top = [para([{ insert: 'a\n' }]), rep, para([{ insert: 'z\n' }])];
  const p1 = B.newBlock('paragraph');
  B.insertAfterFocus(top, rep.id, p1); // focus on the container itself
  assert.deepEqual(rep.item.list.map((b) => b.id), [first.id, p1.id]);
  const p2 = B.newBlock('paragraph');
  B.insertAfterFocus(top, first.id, p2); // beside the focused paragraph inside
  assert.deepEqual(rep.item.list.map((b) => b.id), [first.id, p2.id, p1.id]);
  const pb = B.newBlock('page-break');
  B.insertAfterFocus(top, first.id, pb); // never inside a repeat
  assert.equal(top[2], pb);
  assert.equal(rep.item.list.some((b) => b.type === 'page-break'), false);
});

test('insertAfterFocus: tables, signatures and containers inside a container go beside the focus\'s container-level block, not into a list', () => {
  const rep = B.newContainer('repeat', { group: 'owners' });
  const list = B.newBlock('list');
  rep.item.list = [list];
  const top = [rep];
  const inListItem = list.item[0].id;
  const table = B.newBlock('table-01');
  B.insertAfterFocus(top, inListItem, table);
  assert.deepEqual(rep.item.list.map((b) => b.type), ['list', 'table-01']);
  const sign = B.newBlock('sign-area-01');
  B.insertAfterFocus(top, inListItem, sign);
  assert.deepEqual(rep.item.list.map((b) => b.type), ['list', 'sign-area-01', 'table-01']);
  const cond = B.newContainer('if');
  B.insertAfterFocus(top, inListItem, cond);
  assert.equal(rep.item.list[1].type, 'if');
  // with no focus a block goes to the end of the section
  const end = B.newBlock('paragraph');
  B.insertAfterFocus(top, null, end);
  assert.equal(top.at(-1), end);
});

test('repeatGroupAt / insideRepeat: inside a repeat, or on a table that repeats its first row', () => {
  const rep = B.newContainer('repeat', { group: 'owners' });
  const cond = B.newContainer('if');
  rep.item.list = [cond];
  const table = B.newBlock('table-01');
  table.item.repeatGroup = 'directors';
  const plain = B.newBlock('paragraph');
  const top = [plain, rep, table];
  assert.equal(B.repeatGroupAt(top, plain.id), '');
  assert.equal(B.repeatGroupAt(top, rep.id), 'owners');
  assert.equal(B.repeatGroupAt(top, cond.item.list[0].id), 'owners'); // a paragraph in an if in a repeat
  assert.equal(B.repeatGroupAt(top, table.id), 'directors');
  assert.equal(B.insideRepeat(top, cond.item.list[0].id), true);
  assert.equal(B.insideRepeat(top, plain.id), false);
  assert.equal(B.insideRepeat(top, 'nope'), false);
});

test('moves inside a container only reorder that container\'s list', () => {
  const rep = B.newContainer('repeat', { group: 'owners' });
  const a = B.newBlock('paragraph'); const b = B.newBlock('paragraph'); const c = B.newBlock('paragraph');
  rep.item.list = [a, b, c];
  B.moveItem(rep.item.list, 0, 2);
  assert.deepEqual(rep.item.list.map((x) => x.id), [b.id, c.id, a.id]);
});

test('chips: parse and build "key|pipe", default pipes by field type', () => {
  assert.deepEqual(B.parseChip('dob|date'), { base: 'dob', pipe: 'date' });
  assert.deepEqual(B.parseChip('COMPANY_NAME'), { base: 'COMPANY_NAME', pipe: '' });
  assert.deepEqual(B.parseChip('owners.name|upper'), { base: 'owners.name', pipe: 'upper' });
  assert.equal(B.chipText('dob', 'date'), 'dob|date');
  assert.equal(B.chipText('dob'), 'dob');
  assert.deepEqual(['yesno', 'date', 'country', 'multiselect', 'text', 'select'].map(B.defaultPipe), ['yesno', 'date', 'country', 'list', '', '']);
  assert.ok(B.PIPES.includes('yesno') && B.PIPES.length === 6);
});

test('counting: a chip with a pipe counts for its key; form fields count as filled, manual keys need a value', () => {
  const sections = [{ list: [
    para([chip('COMPANY'), chip('dob|date'), chip('full_name'), chip('owners.name|upper')]),
    B.newContainer('repeat', { group: 'owners' }),
  ] }];
  sections[0].list[1].item.list = [para([chip('owners.#'), chip('COMPANY')])];
  assert.deepEqual(B.placeholderUsage(sections), { COMPANY: 2, dob: 1, full_name: 1, 'owners.name': 1, 'owners.#': 1 });
  const formKeys = B.formKeySet(SCHEMA);
  assert.deepEqual(B.countPlaceholders(sections[0].list, {}, null), { total: 6, replaced: 0 });
  assert.deepEqual(B.countPlaceholders(sections[0].list, { COMPANY: 'Acme' }, formKeys), { total: 6, replaced: 4 }); // 2 COMPANY + dob + full_name; owners.* is not a top-level key
});

test('rename: a key changes in every chip (also inside containers) and keeps each chip\'s pipe', () => {
  const html = '<p><span class="q-placeholder" data-text="dob|date" data-value="" contenteditable="false">{{dob|date}}</span> <span class="q-placeholder" data-text="dob" data-value="">{{dob}}</span> <span data-text="other">x</span></p>';
  const c = cell([chip('dob|date'), chip('dob'), chip('other')], html);
  const rep = B.newContainer('repeat', { group: 'owners' });
  rep.item.list = [{ id: B.uid(), type: 'paragraph', item: c }];
  const sections = [{ list: [rep] }];
  assert.equal(B.renamePlaceholderKey(sections, 'dob', 'born'), 2);
  assert.deepEqual(c.delta.ops.map((o) => o.insert.text), ['born|date', 'born', 'other']);
  assert.ok(c.text.includes('data-text="born|date"') && c.text.includes('data-text="born"') && c.text.includes('data-text="other"'));
  assert.ok(c.text.includes('{{born|date}}'));
});

test('field picker: scalar fields by section with default pipes; files and checklists skipped; groups only where they repeat', () => {
  const plain = B.pickerEntries(SCHEMA, '');
  assert.deepEqual(plain.map((s) => s.section), ['Customer', 'Officer']);
  const customer = plain[0].items;
  assert.deepEqual(customer.map((i) => i.text), ['full_name', 'dob', 'pep', 'country', 'services']);
  assert.deepEqual(customer.map((i) => i.pipe), ['', 'date', 'yesno', 'country', 'list']);
  const inRows = B.pickerEntries(SCHEMA, 'owners')[0].items.map((i) => i.text);
  assert.deepEqual(inRows.slice(-3), ['owners.#', 'owners.name', 'owners.since']);
  assert.equal(B.pickerEntries(SCHEMA, 'owners')[0].items.find((i) => i.text === 'owners.since').pipe, 'date');
  assert.deepEqual(B.pickerEntries(null, ''), []);
});

test('form helpers: fields, groups, keys', () => {
  assert.equal(B.formFields(SCHEMA).length, 9);
  assert.deepEqual(B.formGroups(SCHEMA).map((g) => [g.key, g.fields.map((f) => f.key)]), [['owners', ['name', 'since']]]);
  assert.ok(B.formKeySet(SCHEMA).has('risk') && !B.formKeySet(SCHEMA).has('owners.name'));
  assert.deepEqual(B.formFields(null), []);
});

test('conditions: rows <-> visibleIf, single leaf, all / any, nested ones are left alone', () => {
  assert.deepEqual(B.condToRows({ key: 'pep', op: 'eq', value: true }), { mode: 'all', rows: [{ key: 'pep', op: 'eq', value: true }], complex: false });
  const any = { any: [{ key: 'a', op: 'eq', value: 1 }, { key: 'b', op: 'empty' }] };
  const parsed = B.condToRows(any);
  assert.equal(parsed.mode, 'any');
  assert.equal(parsed.rows.length, 2);
  assert.deepEqual(B.rowsToCond('any', parsed.rows), { any: [{ key: 'a', op: 'eq', value: 1 }, { key: 'b', op: 'empty' }] });
  assert.deepEqual(B.rowsToCond('all', [{ key: 'a', op: 'notEmpty', value: 'x' }]), { key: 'a', op: 'notEmpty' }); // no value for empty / notEmpty
  assert.deepEqual(B.rowsToCond('all', []), { key: '', op: 'notEmpty' });
  assert.equal(B.condToRows({ all: [{ any: [{ key: 'a', op: 'empty' }] }] }).complex, true);
  assert.deepEqual(B.condToRows(null).rows, []);
  assert.equal(B.listToText(['a', 'b']), 'a, b');
  assert.deepEqual(B.textToList(' a, b ,, c '), ['a', 'b', 'c']);
  assert.deepEqual(B.defaultCond(SCHEMA), { key: 'full_name', op: 'notEmpty' });
  assert.deepEqual(B.defaultCond({ sections: [{ id: 's', title: 'S', fields: [{ id: 'x', key: 'agree', label: 'A', type: 'yesno' }] }] }), { key: 'agree', op: 'eq', value: true });
});

test('the saved signature changes with the data source', () => {
  const base = { name: 'n', section: [{ name: 's', list: [] }], placeholders: {} };
  assert.notEqual(B.saveSignature({ ...base, formId: '' }), B.saveSignature({ ...base, formId: 'F1' }));
  assert.equal(B.saveSignature({ ...base }), B.saveSignature({ ...base, formId: '' }));
});
