// The section table, checklist and declaration blocks and their dialogs, and the page setup dialog,
// mounted in jsdom: the previews draw what is saved, the dialogs edit, validate and save the shapes
// the docx renderer reads. The components are bundled with Vite because node can't import .vue files.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { build } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath } from 'node:url';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
let M;

before(async () => {
  const outDir = mkdtempSync(join(tmpdir(), 'template-forms-'));
  await build({
    root, logLevel: 'silent', configFile: false, plugins: [vue()],
    resolve: { dedupe: ['vue'], alias: { '@ds': join(root, '../design-system'), '@': join(root, 'src') } },
    build: { outDir, emptyOutDir: true, minify: false, lib: { entry: join(root, 'test/fixtures/template-forms-entry.js'), formats: ['es'], fileName: 'bundle' } },
  });
  const dom = new JSDOM('<!doctype html><body></body>', { pretendToBeVisual: true });
  for (const k of ['window', 'document', 'Document', 'navigator', 'Node', 'Element', 'HTMLElement', 'HTMLInputElement', 'MutationObserver', 'CustomEvent', 'Event', 'DOMParser', 'Text', 'Comment', 'DocumentFragment', 'SVGElement', 'HTMLSelectElement', 'HTMLTextAreaElement', 'HTMLButtonElement', 'HTMLDialogElement', 'MouseEvent', 'KeyboardEvent', 'getComputedStyle', 'CSS']) {
    if (dom.window[k] !== undefined) Object.defineProperty(globalThis, k, { value: dom.window[k], configurable: true, writable: true });
  }
  // jsdom has no modal dialogs: open / close just toggle the attribute.
  dom.window.HTMLDialogElement.prototype.showModal = function showModal() { this.setAttribute('open', ''); };
  dom.window.HTMLDialogElement.prototype.close = function close() { this.removeAttribute('open'); };
  M = await import(join(outDir, 'bundle.js'));
});

const SCHEMA = {
  sections: [
    { id: 's1', title: 'Customer', fields: [
      { id: 'a', key: 'full_name', label: 'Full name', type: 'text' },
      { id: 'b', key: 'services', label: 'Services', type: 'multiselect', options: [{ value: 'o1', label: 'One' }] },
      { id: 'd', key: 'owners', label: 'Owners', type: 'group', group: { fields: [{ id: 'g1', key: 'name', label: 'Name', type: 'text' }] } },
    ] },
    { id: 's2', title: 'Risk', fields: [{ id: 'e', key: 'risk', label: 'Risk', type: 'checklist', options: [{ value: 'q1', label: 'Is there any match?' }, { value: 'q2', label: 'Is the customer a PEP?' }] }] },
  ],
};

const tick = async () => { await M.nextTick(); await M.nextTick(); };
const mount = (comp, props = {}, ctxOver = {}) => {
  const el = document.createElement('div');
  document.body.appendChild(el);
  const opened = [];
  const ctx = M.reactive({ readonly: false, formSchema: SCHEMA, focusId: '', groupAt: () => '', openDialog: (kind, block) => opened.push([kind, block.id]), setFocus() {}, ...ctxOver });
  let api = null;
  const app = M.createApp({ setup() { M.provide(M.TPL_KEY, ctx); return () => M.h(comp, { ...props, ref: (v) => { api = v; } }); } });
  app.mount(el);
  return { el, ctx, opened, get api() { return api; }, unmount: () => { app.unmount(); el.remove(); } };
};
const type = async (input, value) => { input.value = value; input.dispatchEvent(new window.Event('input', { bubbles: true })); await tick(); };
const byLabel = (root, text, nth = 0) => {
  const labels = [...root.querySelectorAll('label')].filter((l) => l.textContent.trim().startsWith(text));
  const l = labels[nth];
  return l && (l.htmlFor ? root.querySelector(`#${CSS.escape(l.htmlFor)}`) : l.querySelector('input, select, textarea'));
};
const button = (root, text) => [...root.querySelectorAll('button')].find((b) => b.textContent.trim().startsWith(text) || b.getAttribute('aria-label')?.startsWith(text));
const click = async (el) => { el.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); await tick(); };

test('previews draw what is saved: grey title, label over value, pills, repeat badge, stacked cells, numbered questions', async () => {
  const table = { id: 't1', type: 'form-table', item: { title: 'Customer information', rows: [
    { cells: [{ label: 'Full name', value: '{{full_name|upper}}' }, { label: 'Services', value: '{{services}}', list: true }] },
    { repeat: 'owners', cells: [{ label: 'Owner', value: '{{owners.name}}' }] },
    { stack: true, cells: [{ label: 'Nature', value: 'x' }, { label: 'Remarks', value: 'y' }] },
  ] } };
  const m = mount(M.BlockFormTable, { block: table });
  const text = m.el.textContent;
  assert.ok(text.includes('Customer information'));
  assert.ok(text.includes('Full name') && text.includes('full_name|upper') && text.includes('owners.name'));
  assert.ok(text.includes('repeats for each row of owners'));
  assert.ok(text.includes('Nature') && text.includes('Remarks'));
  assert.equal(m.el.querySelectorAll('span.rounded-full').length >= 3, true); // tokens drawn as pills
  await click(m.el.firstElementChild);
  assert.deepEqual(m.opened, [['formTable', 't1']]); // clicking opens the dialog
  m.unmount();

  const chk = { id: 'c1', type: 'form-checklist', item: { title: 'Risk Assessment Checklist', subtitle: 'Customer Risk Assessment', rows: [{ text: 'Is there any match?', value: '{{risk.q1}}' }, { text: 'Another', value: '' }] } };
  const c = mount(M.BlockFormChecklist, { block: chk });
  assert.ok(c.el.textContent.includes('Risk Assessment Checklist') && c.el.textContent.includes('Customer Risk Assessment'));
  assert.ok(c.el.textContent.includes('1.') && c.el.textContent.includes('2.') && c.el.textContent.includes('☐ YES') && c.el.textContent.includes('☐ NO'));
  assert.ok(c.el.textContent.includes('risk.q1'));
  assert.ok(c.el.textContent.includes('needs attention')); // the second question has no answer chosen
  c.unmount();

  const d = mount(M.BlockFormDeclaration, { block: { id: 'd1', type: 'form-declaration', item: { title: 'Declaration', text: 'I declare it.', signer: '{{sig}}' } } });
  assert.ok(d.el.textContent.includes('I declare it.') && d.el.textContent.includes('Signature:') && d.el.textContent.includes('sig'));
  d.unmount();

  const ro = mount(M.BlockFormTable, { block: table }, { readonly: true });
  await click(ro.el.firstElementChild);
  assert.deepEqual(ro.opened, []); // read-only: no dialog
  ro.unmount();
});

test('section table dialog: edits rows and cells, inserts a field at the caret, validates, saves the contract shape', async () => {
  const block = { id: 't1', type: 'form-table', item: { title: 'Section', rows: [{ cells: [{ label: '', value: '' }, { label: '', value: '' }] }] } };
  const m = mount(M.DialogFormTable);
  m.api.open(block);
  await tick();
  const dlg = m.el.querySelector('dialog');
  assert.ok(dlg.hasAttribute('open'));

  // Invalid first (empty values): Save shows what is wrong and keeps the block.
  await click(button(dlg, 'Save'));
  assert.ok(dlg.textContent.includes('add a value'));
  assert.equal(block.item.rows[0].cells[0].value, '');

  await type(byLabel(dlg, 'Title'), 'Customer information');
  await type(byLabel(dlg, 'Label', 0), 'Full name');
  // Insert field: opens the picker, choosing "Full name" puts {{full_name}} in the value.
  await click([...dlg.querySelectorAll('button')].filter((b) => b.textContent.trim() === 'Insert field')[0]);
  await click(dlg.querySelector('button[title="{{full_name}}"]'));
  assert.equal(byLabel(dlg, 'Value', 0).value, '{{full_name}}');
  await type(byLabel(dlg, 'Label', 1), 'Services');
  await type(byLabel(dlg, 'Value', 1), '{{services}}');
  // multiselect value -> the "Numbered list" checkbox appears
  const list = [...dlg.querySelectorAll('label')].find((l) => l.textContent.includes('Numbered list'));
  assert.ok(list, 'numbered list option offered for an array field');
  list.querySelector('input').checked = true; list.querySelector('input').dispatchEvent(new window.Event('change', { bubbles: true }));
  await tick();

  // A second row that repeats for each owner, with a cell width.
  await click(button(dlg, 'Add row'));
  const repeat = [...dlg.querySelectorAll('select[aria-label="Repeat this row for each row of"]')][1];
  repeat.value = 'owners'; repeat.dispatchEvent(new window.Event('change', { bubbles: true })); await tick();
  const cell2 = [...dlg.querySelectorAll('input')].filter((i) => i.id && dlg.querySelector(`label[for="${i.id}"]`)?.textContent.trim() === 'Value');
  await type(cell2[2], '{{owners.name}}'); // third value input = row 2, cell 1
  await type(cell2[3], 'Owner');
  const width = [...dlg.querySelectorAll('select[aria-label="Cell width"]')][2]; // row 2, cell 1
  width.value = '9'; width.dispatchEvent(new window.Event('change', { bubbles: true })); await tick();
  await click(button(dlg, 'Save'));

  assert.equal(dlg.hasAttribute('open'), false, (dlg.querySelector('[role=alert]') || dlg).textContent);
  assert.deepEqual(block.item, { title: 'Customer information', rows: [
    { cells: [{ label: 'Full name', value: '{{full_name}}' }, { label: 'Services', value: '{{services}}', list: true }] },
    { repeat: 'owners', cells: [{ value: '{{owners.name}}', col: 9 }, { value: 'Owner' }] },
  ] });
  m.unmount();
});

test('checklist dialog: add all questions from a checklist field, pick answers, validate, save', async () => {
  const block = { id: 'c1', type: 'form-checklist', item: { title: 'Checklist', subtitle: '', rows: [{ text: '', value: '' }, { text: '', value: '' }] } };
  const m = mount(M.DialogChecklist);
  m.api.open(block);
  await tick();
  const dlg = m.el.querySelector('dialog');
  await click(button(dlg, 'Save'));
  assert.ok(dlg.textContent.includes('write the question') && dlg.textContent.includes('choose the checklist answer'));
  assert.equal(block.item.rows.length, 2); // refused

  // Start over with the form's own questions: remove the two blank rows, then "Add all".
  for (let i = 0; i < 2; i++) await click(dlg.querySelector('button[aria-label="Delete question"]'));
  assert.equal(dlg.querySelectorAll('ol > li').length, 0);
  await click(button(dlg, 'Add all'));
  const qs = [...dlg.querySelectorAll('ol > li textarea')].map((t) => t.value);
  assert.deepEqual(qs, ['Is there any match?', 'Is the customer a PEP?']);
  const answers = [...dlg.querySelectorAll('ol > li select')].map((s) => s.value);
  assert.deepEqual(answers, ['risk.q1', 'risk.q2']);

  await type(byLabel(dlg, 'Title'), 'Risk Assessment Checklist');
  await type(byLabel(dlg, 'Sub heading'), 'Customer Risk Assessment');
  // Re-point the second question at another answer through its select.
  const sel = dlg.querySelectorAll('ol > li select')[1];
  sel.value = 'risk.q1'; sel.dispatchEvent(new window.Event('change', { bubbles: true })); await tick();
  await click(button(dlg, 'Save'));
  assert.equal(dlg.hasAttribute('open'), false, (dlg.querySelector('[role=alert]') || dlg).textContent);
  assert.deepEqual(block.item, { title: 'Risk Assessment Checklist', subtitle: 'Customer Risk Assessment', rows: [
    { text: 'Is there any match?', value: '{{risk.q1}}' },
    { text: 'Is the customer a PEP?', value: '{{risk.q1}}' },
  ] });
  m.unmount();
});

test('declaration dialog: keeps its defaults, edits, and saves only what is set', async () => {
  const defaults = { title: 'Declaration', text: 'Text here.', signatureLabel: 'Signature:', nameLabel: 'Name', dateLabel: 'Date', signer: '' };
  const block = { id: 'd1', type: 'form-declaration', item: { ...defaults } };
  const m = mount(M.DialogDeclaration);
  m.api.open(block);
  await tick();
  const dlg = m.el.querySelector('dialog');
  assert.equal(byLabel(dlg, 'Heading').value, 'Declaration');
  await type(byLabel(dlg, 'Date line'), '');
  await type(byLabel(dlg, 'Signer'), '{{declaration_signature}}');
  await click(button(dlg, 'Save'));
  assert.deepEqual(block.item, { title: 'Declaration', text: 'Text here.', signatureLabel: 'Signature:', nameLabel: 'Name', signer: '{{declaration_signature}}' });
  m.unmount();
});

test('page setup dialog: style and frame are applied to the template; opens with the older template (no style)', async () => {
  const template = { name: 'T' }; // an older template: no style, no frame
  const m = mount(M.DialogPageSetup);
  m.api.open(template);
  await tick();
  const dlg = m.el.querySelector('dialog');
  assert.equal(dlg.querySelector('input[type=radio]:checked').value, 'letter');
  const form = [...dlg.querySelectorAll('input[type=radio]')].find((r) => r.value === 'form');
  form.checked = true; form.dispatchEvent(new window.Event('change', { bubbles: true })); await tick();
  await type(byLabel(dlg, 'Header, left'), 'Customer Due Diligence Form');
  await type(byLabel(dlg, 'Header, right'), 'Case Reference: {{submission_ref}}');
  await type(byLabel(dlg, 'Footer, left'), ' Acme Advisory ');
  assert.ok(dlg.textContent.includes('Page 1/1') && dlg.textContent.includes('submission_ref')); // preview with the token as a pill
  await click(button(dlg, 'Apply'));
  assert.equal(template.style, 'form');
  assert.deepEqual(template.frame, { headerLeft: 'Customer Due Diligence Form', headerRight: 'Case Reference: {{submission_ref}}', footerLeft: 'Acme Advisory' });
  m.unmount();
});

test('a seeded-style table (widths 2/4/2/2/2, repeat, stack, column titles) opens and saves back unchanged', async () => {
  const item = { title: 'Shareholders', rows: [
    { cells: [{ value: 'No.', col: 2, head: true }, { value: 'Name', col: 4, head: true }, { value: 'ID', col: 2, head: true }, { value: 'Class', col: 2, head: true }, { value: '%', col: 2, head: true }] },
    { repeat: 'owners', cells: [{ value: '{{owners.#}}', col: 2 }, { label: 'Name', value: '{{owners.name}}', col: 4 }, { value: '{{full_name}}', col: 2 }, { value: '{{full_name}}', col: 2 }, { value: '{{full_name|upper}}', col: 2 }] },
    { stack: true, cells: [{ label: 'Nature', value: '{{services}}', list: true, col: 6 }, { label: 'Remarks', value: '{{full_name}}', col: 6 }] },
  ] };
  const block = { id: 't9', type: 'form-table', item: JSON.parse(JSON.stringify(item)) };

  const preview = mount(M.BlockFormTable, { block });
  assert.ok(preview.el.textContent.includes('Name') && preview.el.textContent.includes('owners.#'));
  const firstRow = preview.el.querySelector('div.flex:not(.mb-1)'); // the column titles row
  assert.equal(firstRow.querySelectorAll('p.text-ink-faint').length, 5); // small grey text...
  assert.equal(firstRow.querySelectorAll('p.font-semibold').length, 0); // ...not bold values
  preview.unmount();

  const m = mount(M.DialogFormTable);
  m.api.open(block);
  await tick();
  const dlg = m.el.querySelector('dialog');
  // the head cells show a "Column title" field and no label field
  assert.equal([...dlg.querySelectorAll('label')].filter((l) => l.textContent.trim() === 'Column title').length >= 5, true);
  await click(button(dlg, 'Save'));
  assert.equal(dlg.hasAttribute('open'), false, (dlg.querySelector('[role=alert]') || dlg).textContent);
  assert.deepEqual(block.item, item);

  // Turning a normal cell into a column title drops its label and list, and keeps the width.
  m.api.open(block);
  await tick();
  const boxes = [...dlg.querySelectorAll('label')].filter((l) => l.textContent.trim() === 'Column title' && l.querySelector('input[type=checkbox]'));
  const target = boxes[6]; // row 1 has 5 column titles (0-4); row 2 cell 1 is 5, cell 2 ("Name", width 4) is 6
  target.querySelector('input').checked = true; target.querySelector('input').dispatchEvent(new window.Event('change', { bubbles: true })); await tick();
  await click(button(dlg, 'Save'));
  assert.deepEqual(block.item.rows[1].cells[1], { value: '{{owners.name}}', col: 4, head: true });
  assert.deepEqual(block.item.rows[0], item.rows[0]);
  m.unmount();
});
