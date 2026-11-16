// Template editor helpers (src/helpers/template/blocks.js): block factories, tree insert, placeholder
// counting and renaming, moves, save shape.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as B from '../src/helpers/template/blocks.js';

const chip = (text, value = '') => ({ insert: { text, value }, attributes: { placeholder: true } });
const para = (ops, html = '') => ({ id: B.uid(), type: 'paragraph', item: { text: html, delta: { ops: [...ops, { insert: '\n' }] } } });

test('new blocks have the corpsec JSON shapes', () => {
  assert.deepEqual(B.newBlock('paragraph').item, { text: '' });
  const list = B.newBlock('list');
  assert.equal(list.item.length, 1);
  assert.equal(list.item[0].type, 'list-item-paragraph');
  assert.deepEqual(Object.keys(B.newBlock('table-01').item.data[0]), ['col1', 'col2']);
  assert.deepEqual(Object.keys(B.newBlock('table-03').item.data[0]), ['col1', 'col2', 'col3']);
  assert.deepEqual(B.newBlock('sign-area-01').item.data, { desc: 'DIRECTOR(S)', signers: [] });
  assert.deepEqual(B.newBlock('layout-company-header-01').item.data, { companyName: '', companyRegNo: '', subHeader: '', incorporationLine: '' });
  assert.deepEqual(Object.keys(B.newBlock('layout-corpsec-header-01').item.data), ['companyName', 'companyRegNo', 'subHeader']);
  assert.deepEqual(B.newBlock('layout-form-45b').item.data, { title: '', subHeader: '' });
  assert.deepEqual(B.newBlock('page-break-02').item.data, { footerPageNo: '2', headerPageNo: '2' });
  assert.deepEqual(B.newBlock('page-break').item, { data: {} });
  // rows do not share cell objects
  const t = B.newBlock('table-01');
  assert.notEqual(t.item.data[0].col1, t.item.data[1].col1);
});

test('ensureTableCols adds the columns a bigger table type shows', () => {
  const rows = [{ col1: B.emptyCell(), col2: B.emptyCell() }];
  B.ensureTableCols(rows, 'table-03');
  assert.deepEqual(Object.keys(rows[0]), ['col1', 'col2', 'col3']);
});

test('cloneBlock gives new ids all the way down and leaves the original alone', () => {
  const l = B.newBlock('list');
  const copy = B.cloneBlock(l);
  assert.notEqual(copy.id, l.id);
  assert.notEqual(copy.item[0].id, l.item[0].id);
  assert.equal(copy.item[0].type, 'list-item-paragraph');
});

test('findPath and insertAfterFocus: text goes beside the focus, layout blocks below the top-level block', () => {
  const list = [B.newBlock('paragraph'), B.newBlock('list'), B.newBlock('paragraph')];
  const inner = list[1].item[0];
  assert.deepEqual(B.findPath(list, inner.id), [1, 0]);
  assert.equal(B.findPath(list, 'nope'), null);

  const li = B.newBlock('list-item-paragraph');
  B.insertAfterFocus(list, inner.id, li);
  assert.equal(list[1].item[1], li); // inside the list, after the focused item

  const sign = B.newBlock('sign-area-02');
  B.insertAfterFocus(list, inner.id, sign);
  assert.equal(list[2], sign); // after the list, not inside it
  assert.equal(list[1].item.length, 2);

  const end = B.newBlock('paragraph');
  B.insertAfterFocus(list, null, end);
  assert.equal(list.at(-1), end);
});

test('moveItem and indexAfterMove agree on where the current item goes', () => {
  for (const [from, to] of [[0, 2], [2, 0], [1, 3], [3, 1], [1, 1]]) {
    const arr = ['a', 'b', 'c', 'd'];
    for (let current = 0; current < 4; current++) {
      const item = arr[current];
      const moved = B.moveItem([...arr], from, to);
      assert.equal(moved[B.indexAfterMove(current, from, to)], item, `from ${from} to ${to}, current ${current}`);
    }
  }
});

test('normalizeKey', () => {
  assert.equal(B.normalizeKey(' company name '), 'COMPANY_NAME');
  assert.equal(B.normalizeKey('{{reg-no}}'), 'REG_NO');
  assert.equal(B.normalizeKey('  '), '');
});

test('countPlaceholders: chips in paragraphs, nested lists and table cells; replaced by own value or the map', () => {
  const list = [
    para([chip('NAME'), chip('DATE', '1 Jan')]),
    { id: 'l', type: 'list', item: [{ id: 'li', type: 'list-item-paragraph', item: { text: '', delta: { ops: [chip('NAME'), { insert: '\n' }] } } }] },
    { id: 't', type: 'table-01', item: { data: [{ col1: { text: '', delta: { ops: [chip('ADDR'), { insert: '\n' }] } }, col2: B.emptyCell() }] } },
  ];
  assert.deepEqual(B.countPlaceholders(list, {}), { total: 4, replaced: 1 });
  assert.deepEqual(B.countPlaceholders(list, { NAME: 'Acme' }), { total: 4, replaced: 3 });
  assert.deepEqual(B.placeholderUsage([{ name: 's', list }]), { NAME: 2, DATE: 1, ADDR: 1 });
});

test('renamePlaceholderKey changes delta and html, and nothing else', () => {
  const html = '<p>Dear <span class="q-placeholder" data-text="NAME" data-value="" contenteditable="false">{{NAME}}</span> and NAME</p>';
  const sections = [{ name: 's', list: [para([chip('NAME'), chip('OTHER')], html)] }];
  assert.equal(B.renamePlaceholderKey(sections, 'NAME', 'CLIENT'), 1);
  const cell = sections[0].list[0].item;
  assert.deepEqual(cell.delta.ops.slice(0, 2).map((o) => o.insert.text), ['CLIENT', 'OTHER']);
  assert.ok(cell.text.includes('data-text="CLIENT"') && cell.text.includes('{{CLIENT}}'));
  assert.ok(cell.text.includes('and NAME')); // plain text is untouched
});

test('save shape: sections are exactly { name, list }; the signature ignores client-only keys', () => {
  const sections = [{ name: ' intro ', list: [B.newBlock('paragraph')], history: { undoStack: [] } }];
  const out = B.sectionsForSave(sections);
  assert.deepEqual(Object.keys(out[0]), ['name', 'list']);
  assert.equal(out[0].name, 'intro');
  assert.deepEqual(B.placeholdersForSave({ A: 'x', '': 'drop', B: null }), { A: 'x', B: '' });
  const a = B.saveSignature({ name: 'n', section: sections, placeholders: {} });
  sections[0].history.undoStack.push(1);
  assert.equal(B.saveSignature({ name: 'n', section: sections, placeholders: {} }), a);
});
