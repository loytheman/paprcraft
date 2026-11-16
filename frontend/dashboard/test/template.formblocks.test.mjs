// Section table, checklist table, declaration and page setup of the template editor: block shapes
// (the contract with the docx renderer), {{token}} helpers, row / cell operations, "add all
// questions" from a checklist field, counting and renaming, saving. Pure helpers, no Vue.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as B from '../src/helpers/template/blocks.js';

const SCHEMA = {
  sections: [
    { id: 's1', title: 'Customer', fields: [
      { id: 'a', key: 'full_name', label: 'Full name', type: 'text' },
      { id: 'b', key: 'services', label: 'Services', type: 'multiselect', options: [{ value: 'o1', label: 'One' }] },
      { id: 'c', key: 'dob', label: 'DOB', type: 'date' },
      { id: 'd', key: 'owners', label: 'Owners', type: 'group', group: { fields: [{ id: 'g1', key: 'name', label: 'Name', type: 'text' }, { id: 'g2', key: 'tags', label: 'Tags', type: 'multiselect', options: [{ value: 't', label: 'T' }] }] } },
    ] },
    { id: 's2', title: 'Risk', fields: [
      { id: 'e', key: 'risk_customer', label: 'Customer risk', type: 'checklist', options: [{ value: 'q1', label: 'Is there any match?' }, { value: 'q2', label: 'Is the customer a PEP?' }] },
      { id: 'f', key: 'risk_country', label: 'Country risk', type: 'checklist', options: [{ value: 'q1', label: 'High-risk country?' }] },
    ] },
  ],
};
const para = () => ({ id: B.uid(), type: 'paragraph', item: { text: '' } });

test('new blocks start with the shapes the renderer reads', () => {
  const t = B.newBlock('form-table');
  assert.equal(t.type, 'form-table');
  assert.deepEqual(Object.keys(t.item).sort(), ['rows', 'title']);
  assert.equal(t.item.title, 'Section');
  assert.equal(t.item.rows.length, 1);
  assert.equal(t.item.rows[0].cells.length, 2);
  assert.deepEqual(Object.keys(t.item.rows[0].cells[0]).sort(), ['label', 'value']);
  const c = B.newBlock('form-checklist');
  assert.equal(c.item.rows.length, 2);
  assert.deepEqual(c.item.rows[0], { text: '', value: '' });
  const d = B.newBlock('form-declaration');
  assert.deepEqual(Object.keys(d.item).sort(), ['dateLabel', 'nameLabel', 'signatureLabel', 'signer', 'text', 'title']);
  assert.match(d.item.text, /accurate and truthful/);
});

test('they are top-level / container blocks: never put inside a list, a focused container takes them', () => {
  assert.ok(B.FORM_BLOCK_TYPES.every((t) => B.ROOT_ONLY_TYPES.includes(t)));
  const item = { id: 'li1', type: 'list-item-paragraph', item: { text: '' } };
  const list = { id: 'l1', type: 'list', item: [item] };
  const root = [list];
  const table = B.newBlock('form-table');
  B.insertAfterFocus(root, 'li1', table);
  assert.deepEqual(root.map((b) => b.type), ['list', 'form-table']); // below the list, not inside it
  const rep = B.newContainer('repeat', { group: 'owners' });
  const root2 = [rep];
  const chk = B.newBlock('form-checklist');
  B.insertAfterFocus(root2, rep.id, chk);
  assert.equal(rep.item.list.at(-1), chk); // a focused repeat takes it inside
});

test('tokens: found, single, inserted at the caret, renamed', () => {
  assert.deepEqual(B.tokensIn('Born {{ dob|date }}, {{full_name}} {{owners.#}}').map((t) => [t.base, t.pipe]), [['dob', 'date'], ['full_name', ''], ['owners.#', '']]);
  assert.equal(B.singleToken('{{risk_customer.q1}}'), 'risk_customer.q1');
  assert.equal(B.singleToken(' {{dob|date}} '), 'dob');
  assert.equal(B.singleToken('x {{a}}'), null);
  assert.equal(B.singleToken(''), null);
  assert.equal(B.tokenText('dob', 'date'), '{{dob|date}}');
  assert.deepEqual(B.insertTokenAt('Hello !', '{{name}}', 6), { value: 'Hello {{name}}!', caret: 14 });
  assert.deepEqual(B.insertTokenAt('Hello XX!', '{{n}}', 6, 8), { value: 'Hello {{n}}!', caret: 11 }); // replaces the selection
  assert.deepEqual(B.insertTokenAt('Hi', '{{n}}'), { value: 'Hi{{n}}', caret: 7 }); // no caret: at the end
  assert.equal(B.renameTokensIn('{{old|upper}} and {{older}} {{old}}', 'old', 'new'), '{{new|upper}} and {{older}} {{new}}');
});

test('rows and cells: add, remove (1 to MAX_CELLS cells), set the count, widths', () => {
  const rows = [];
  const r = B.addRow(rows, 2);
  assert.equal(rows.length, 1);
  assert.equal(r.cells.length, 2);
  while (r.cells.length < B.MAX_CELLS) assert.ok(B.addCell(r));
  assert.equal(B.addCell(r), null); // MAX_CELLS is the most
  assert.equal(r.cells.length, B.MAX_CELLS);
  assert.ok(B.MAX_CELLS >= 5); // the seeded tables have 5 columns
  assert.ok(B.removeCell(r, 0));
  B.setCellCount(r, 1);
  assert.equal(r.cells.length, 1);
  assert.equal(B.removeCell(r, 0), null); // the last cell stays
  B.setCellCount(r, 9);
  assert.equal(r.cells.length, B.MAX_CELLS);
  assert.deepEqual(B.cellWidths({ cells: [{}, {}] }), [6, 6]);
  assert.deepEqual(B.cellWidths({ cells: [{}, {}, {}] }), [4, 4, 4]);
  assert.deepEqual(B.cellWidths({ cells: [{ col: 3 }, {}] }), [3, 9]);
  assert.deepEqual(B.cellWidths({ cells: [{ col: 12 }] }), [12]);
  B.addRow(rows, 3, 0);
  assert.equal(rows[0].cells.length, 3);
  B.moveItem(rows, 0, 1);
  assert.equal(rows[1].cells.length, 3);
});

test('saved shape: only the keys of the contract, no empty extras', () => {
  const item = B.cleanFormTable({ title: ' Customer ', rows: [
    { repeat: '', stack: false, cells: [{ label: ' Full name ', value: '{{full_name|upper}}', list: false, col: 0 }, { label: '', value: '{{dob|date}}', col: 6 }] },
    { repeat: 'owners', stack: true, cells: [{ label: 'Services', value: '{{services}}', list: true }] },
  ] });
  assert.deepEqual(item, { title: 'Customer', rows: [
    { cells: [{ label: 'Full name', value: '{{full_name|upper}}' }, { value: '{{dob|date}}', col: 6 }] },
    { repeat: 'owners', stack: true, cells: [{ label: 'Services', value: '{{services}}', list: true }] },
  ] });
  assert.deepEqual(B.cleanChecklist({ title: ' T ', subtitle: ' ', rows: [{ text: ' Q ', value: ' {{a.q1}} ' }] }), { title: 'T', rows: [{ text: 'Q', value: '{{a.q1}}' }] });
  assert.deepEqual(B.cleanChecklist({ title: 'T', subtitle: 'Sub', rows: [] }), { title: 'T', subtitle: 'Sub', rows: [] });
  assert.deepEqual(B.cleanDeclaration({ title: 'Declaration', text: '', signatureLabel: 'Signature:', signer: '{{sig}}' }), { title: 'Declaration', signatureLabel: 'Signature:', signer: '{{sig}}' });
});

test('checklist: the form\'s checklist fields, and one row per option for "add all questions"', () => {
  assert.deepEqual(B.checklistFields(SCHEMA).map((f) => [f.key, f.options.length]), [['risk_customer', 2], ['risk_country', 1]]);
  assert.deepEqual(B.checklistRows(SCHEMA, 'risk_customer'), [
    { text: 'Is there any match?', value: '{{risk_customer.q1}}' },
    { text: 'Is the customer a PEP?', value: '{{risk_customer.q2}}' },
  ]);
  assert.deepEqual(B.checklistRows(SCHEMA, 'nope'), []);
  assert.deepEqual(B.checklistRows(null, 'risk_customer'), []);
});

test('numbered lists are offered only for array values (multiselect, also inside a group)', () => {
  assert.equal(B.tokenIsArray(SCHEMA, '{{services}}'), true);
  assert.equal(B.tokenIsArray(SCHEMA, '{{full_name}}'), false);
  assert.equal(B.tokenIsArray(SCHEMA, '{{owners.tags}}'), true);
  assert.equal(B.tokenIsArray(SCHEMA, '{{owners.name}}'), false);
  assert.equal(B.tokenIsArray(SCHEMA, 'plain text'), false);
  assert.equal(B.tokenIsArray(null, '{{services}}'), false);
});

test('validation: what the dialogs tell the user', () => {
  const ok = { type: 'form-table', item: { title: 'T', rows: [{ cells: [{ label: 'A', value: '{{a}}' }, { value: '{{b}}', col: 6 }] }] } };
  assert.deepEqual(B.validateFormBlock(ok, SCHEMA), []);
  assert.ok(B.validateFormBlock({ type: 'form-table', item: { title: '', rows: [] } }).length >= 2);
  const empty = B.newBlock('form-table');
  assert.ok(B.validateFormBlock(empty).some((m) => /add a value/.test(m)));
  const wide = { type: 'form-table', item: { title: 'T', rows: [{ cells: [{ value: 'a', col: 9 }, { value: 'b', col: 6 }] }] } };
  assert.ok(B.validateFormBlock(wide).some((m) => /wider than the page/.test(m)));
  const badGroup = { type: 'form-table', item: { title: 'T', rows: [{ repeat: 'nope', cells: [{ value: '{{x}}' }] }] } };
  assert.ok(B.validateFormBlock(badGroup, SCHEMA).some((m) => /not a repeating group/.test(m)));
  assert.deepEqual(B.validateFormBlock(badGroup), []); // no schema: groups are not checked
  const chk = { type: 'form-checklist', item: { title: 'C', rows: [{ text: 'Q', value: '{{risk.q1}}' }, { text: '', value: 'free text' }] } };
  const msgs = B.validateFormBlock(chk);
  assert.equal(msgs.length, 2);
  assert.match(msgs[0], /Question 2: write the question/);
  assert.deepEqual(B.validateFormBlock({ type: 'form-declaration', item: {} }), []);
});

test('tokens in the form blocks and the page frame count as used keys; built-ins and form fields count as filled', () => {
  const table = { id: 't', type: 'form-table', item: { title: 'T', rows: [{ cells: [{ value: '{{full_name|upper}}' }, { value: '{{firm_name}}' }] }] } };
  const chk = { id: 'c', type: 'form-checklist', item: { title: 'C', rows: [{ text: 'Q', value: '{{risk_customer.q1}}' }] } };
  const decl = { id: 'd', type: 'form-declaration', item: { signer: '{{full_name}}' } };
  const rep = B.newContainer('repeat', { group: 'owners' });
  rep.item.list = [{ id: 't2', type: 'form-table', item: { title: 'Owners', rows: [{ repeat: 'owners', cells: [{ value: '{{owners.name}}' }] }] } }];
  const sections = [{ list: [table, chk, decl, rep] }];
  const frame = { headerLeft: 'Form', headerRight: 'Ref {{submission_ref}}', footerLeft: '{{firm_name}}' };
  const usage = B.placeholderUsage(sections, frame);
  assert.deepEqual(usage, { full_name: 2, firm_name: 2, 'risk_customer.q1': 1, 'owners.name': 1, submission_ref: 1 });
  assert.deepEqual(B.placeholderUsage(sections), { full_name: 2, firm_name: 1, 'risk_customer.q1': 1, 'owners.name': 1 });
  const formKeys = B.formKeySet(SCHEMA);
  // 5 tokens: full_name x2, risk_customer.q1, owners.name are form fields; firm_name needs a value
  assert.deepEqual(B.countPlaceholders(sections[0].list, {}, formKeys), { total: 5, replaced: 4 });
  assert.deepEqual(B.countPlaceholders(sections[0].list, { firm_name: 'Acme' }, formKeys), { total: 5, replaced: 5 });
  assert.ok(B.BUILTIN_KEYS.has('submission_ref'));
  assert.deepEqual(B.countPlaceholders([{ id: 'x', type: 'form-declaration', item: { signer: '{{generated_date}}' } }], {}, null), { total: 1, replaced: 1 });
});

test('renaming a manual key follows into the tokens of the form blocks', () => {
  const table = { id: 't', type: 'form-table', item: { title: 'T', rows: [{ cells: [{ value: 'By {{firm_name|upper}} and {{firm_names}}' }] }] } };
  const chk = { id: 'c', type: 'form-checklist', item: { title: 'C', rows: [{ text: 'Q', value: '{{firm_name}}' }] } };
  const decl = { id: 'd', type: 'form-declaration', item: { signer: '{{firm_name}}' } };
  const n = B.renamePlaceholderKey([{ list: [table, chk, decl] }], 'firm_name', 'company');
  assert.equal(n, 3);
  assert.equal(table.item.rows[0].cells[0].value, 'By {{company|upper}} and {{firm_names}}');
  assert.equal(chk.item.rows[0].value, '{{company}}');
  assert.equal(decl.item.signer, '{{company}}');
});

test('clone: a form block gets a fresh id and its own copy of the rows', () => {
  const t = B.newBlock('form-table');
  const copy = B.cloneBlock(t);
  assert.notEqual(copy.id, t.id);
  copy.item.rows[0].cells[0].value = 'x';
  assert.equal(t.item.rows[0].cells[0].value, '');
});

test('the field picker also offers the document info values, and they work without a form', () => {
  const g = B.builtinEntries();
  assert.equal(g.length, 1);
  assert.equal(g[0].section, 'Document info');
  assert.deepEqual(g[0].items.map((i) => i.text), ['submission_ref', 'submission_title', 'generated_date', 'form_name']);
  assert.equal(g[0].items.find((i) => i.text === 'generated_date').pipe, 'date');
  assert.deepEqual(B.pickerEntries(null), []);
  assert.ok(B.pickerEntries(SCHEMA).every((s) => s.section !== 'Document info')); // the picker adds them itself
});

test('page setup: frame is saved as null when empty, and style / frame count as changes', () => {
  assert.equal(B.frameForSave(null), null);
  assert.equal(B.frameForSave({ headerLeft: ' ', headerRight: '', footerLeft: '' }), null);
  assert.deepEqual(B.frameForSave({ headerLeft: ' CDD ', footerLeft: 'Firm' }), { headerLeft: 'CDD', headerRight: '', footerLeft: 'Firm' });
  assert.deepEqual(B.PAGE_STYLES.map((s) => s.value), ['letter', 'form']);
  const base = { name: 'T', section: [{ name: 's', list: [para()] }], placeholders: {}, formId: '' };
  const sig = B.saveSignature(base);
  assert.notEqual(B.saveSignature({ ...base, style: 'form' }), sig);
  assert.notEqual(B.saveSignature({ ...base, frame: { headerLeft: 'x' } }), sig);
  assert.equal(B.saveSignature({ ...base, frame: { headerLeft: ' ' } }), sig); // blank frame = none
  assert.equal(B.saveSignature({ ...base, style: undefined }), sig); // older templates: no style
});

test('column titles (head): value only, may be empty, never a label or a list, kept when saved', () => {
  const cell = { label: 'Name', value: 'x', list: true };
  B.toggleHead(cell, true);
  assert.deepEqual(cell, { label: '', value: 'x', list: false, head: true });
  B.toggleHead(cell);
  assert.equal(cell.head, false);
  const saved = B.cleanFormTable({ title: 'T', rows: [{ cells: [
    { label: 'ignored', value: 'Name', list: true, head: true, col: 4 },
    { value: '', head: true },
    { label: 'Full name', value: '{{full_name}}', col: 8 },
  ] }] });
  assert.deepEqual(saved.rows[0].cells, [{ value: 'Name', col: 4, head: true }, { value: '', head: true }, { label: 'Full name', value: '{{full_name}}', col: 8 }]);
  // an empty value is fine for a column title, not for a normal cell
  assert.deepEqual(B.validateFormBlock({ type: 'form-table', item: { title: 'T', rows: [{ cells: [{ value: '', head: true }, { value: '{{a}}' }] }] } }), []);
  assert.equal(B.validateFormBlock({ type: 'form-table', item: { title: 'T', rows: [{ cells: [{ value: '' }] }] } }).length, 1);
  // widths of a seeded row (2/4/2/2/2) are kept as they are
  assert.deepEqual(B.cellWidths({ cells: [{ col: 2 }, { col: 4 }, { col: 2 }, { col: 2 }, { col: 2 }] }), [2, 4, 2, 2, 2]);
});
