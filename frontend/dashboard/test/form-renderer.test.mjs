// FormRenderer (frontend/design-system/components/FormRenderer.vue) mounted in jsdom: every field type
// renders, typing updates the values, visibleIf hides fields live, group rows add and show their errors,
// uploads emit attachments, readonly and public modes. The component is bundled with Vite (as the apps
// are) because node can't import .vue files.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { build } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
let M; // the bundle: createApp, h, reactive, nextTick, FormRenderer
let outDir;

before(async () => {
  outDir = mkdtempSync(join(tmpdir(), 'form-renderer-'));
  await build({
    root, logLevel: 'silent', configFile: false, plugins: [vue()],
    resolve: { dedupe: ['vue'] },
    build: { outDir, emptyOutDir: true, minify: false, lib: { entry: join(root, 'test/fixtures/form-renderer-entry.js'), formats: ['es'], fileName: 'bundle' } },
  });
  const dom = new JSDOM('<!doctype html><body></body>', { pretendToBeVisual: true });
  for (const k of ['window', 'document', 'navigator', 'Node', 'Element', 'HTMLElement', 'HTMLInputElement', 'MutationObserver', 'CustomEvent', 'Event', 'File', 'DOMParser', 'Text', 'Comment', 'DocumentFragment', 'SVGElement', 'HTMLSelectElement', 'HTMLTextAreaElement', 'HTMLButtonElement', 'MouseEvent', 'KeyboardEvent', 'getComputedStyle', 'CSS']) {
    if (dom.window[k] !== undefined) Object.defineProperty(globalThis, k, { value: dom.window[k], configurable: true, writable: true });
  }
  M = await import(join(outDir, 'bundle.js'));
});

const schema = () => ({
  sections: [
    { id: 's1', title: 'Customer', description: 'Who is the customer?', fields: [
      { id: '1', key: 'full_name', type: 'text', label: 'Full name', required: true, help: 'As on the ID' },
      { id: '2', key: 'bio', type: 'longtext', label: 'About' },
      { id: '3', key: 'age', type: 'number', label: 'Age' },
      { id: '4', key: 'dob', type: 'date', label: 'Date of birth' },
      { id: '5', key: 'email', type: 'email', label: 'Email' },
      { id: '6', key: 'phone', type: 'phone', label: 'Phone' },
      { id: '7', key: 'kind', type: 'select', label: 'Kind', options: [{ value: 'ind', label: 'Individual' }, { value: 'co', label: 'Company' }] },
      { id: '8', key: 'company_name', type: 'text', label: 'Company name', visibleIf: { key: 'kind', op: 'eq', value: 'co' } },
      { id: '9', key: 'nationality', type: 'country', label: 'Nationality' },
      { id: '10', key: 'services', type: 'multiselect', label: 'Services', options: [{ value: 'a', label: 'Alpha' }, { value: 'b', label: 'Beta' }] },
      { id: '11', key: 'pep', type: 'yesno', label: 'Is a PEP?' },
      { id: '12', key: 'checks', type: 'checklist', label: 'Checks', options: [{ value: 'q1', label: 'Sanctions match' }, { value: 'q2', label: 'High-risk country' }] },
      { id: '13', key: 'id_copy', type: 'file', label: 'ID copy' },
      { id: '14', key: 'owners', type: 'group', label: 'Owner', group: { min: 1, max: 2, fields: [
        { id: 'g1', key: 'name', type: 'text', label: 'Owner name', required: true },
        { id: 'g2', key: 'role', type: 'select', label: 'Role', options: [{ value: 'dir', label: 'Director' }] },
        { id: 'g3', key: 'note', type: 'text', label: 'Note', visibleIf: { key: 'role', op: 'eq', value: 'dir' } },
      ] } },
      { id: '15', key: 'sign', type: 'signature', label: 'Signature' },
    ] },
    { id: 's2', title: 'Officer use', fields: [{ id: '16', key: 'risk', type: 'select', label: 'Risk rating', internal: true, options: [{ value: 'low', label: 'Low' }] }] },
  ],
});

// Mounts the renderer with state we can read and change; returns helpers.
const mount = (extra = {}) => {
  const state = M.reactive({ values: {}, attachments: [], errors: [], audience: 'account', readonly: false, ...extra });
  const events = { values: [], attachments: [] };
  const el = document.createElement('div');
  document.body.appendChild(el);
  let refRenderer;
  const app = M.createApp({
    render: () => M.h(M.FormRenderer, {
      ref: (r) => { refRenderer = r; },
      schema: state.schema ?? schema(), modelValue: state.values, errors: state.errors, audience: state.audience, readonly: state.readonly,
      attachments: state.attachments, uploader: state.uploader, consentText: 'I agree.',
      'onUpdate:modelValue': (v) => { events.values.push(v); state.values = v; },
      'onUpdate:attachments': (a) => { events.attachments.push(a); state.attachments = a; },
    }),
  });
  app.mount(el);
  return { state, events, el, get renderer() { return refRenderer; }, text: () => el.textContent, q: (s) => el.querySelector(s), qa: (s) => [...el.querySelectorAll(s)], flush: () => M.nextTick(), unmount: () => { app.unmount(); el.remove(); } };
};
const labelInput = (m, label) => m.qa('label').find((l) => l.textContent.trim().startsWith(label));
const typeInto = async (m, label, value) => {
  const input = m.el.querySelector(`#${CSS.escape(labelInput(m, label).getAttribute('for'))}`);
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await m.flush();
};
const button = (m, text) => m.qa('button').find((b) => b.textContent.includes(text));

test('every field type renders with its label, help and required marker', () => {
  const m = mount();
  const t = m.text();
  for (const s of ['Customer', 'Who is the customer?', 'Full name', 'As on the ID', 'About', 'Age', 'Date of birth', 'Email', 'Phone', 'Kind', 'Nationality', 'Services', 'Alpha', 'Is a PEP?', 'Yes', 'Checks', 'Sanctions match', 'ID copy', 'Add file', 'Owner', 'Add owner', 'Signature', 'I agree.', 'Officer use', 'Risk rating', 'Internal']) assert.ok(t.includes(s), `missing "${s}"`);
  assert.ok(labelInput(m, 'Full name').textContent.includes('*'));
  assert.equal(m.q('input[type=number]') !== null, true);
  assert.equal(m.q('input[type=date]') !== null, true);
  assert.equal(m.q('input[type=email]') !== null, true);
  assert.equal(m.q('input[type=tel]') !== null, true);
  assert.equal(m.q('textarea') !== null, true);
  assert.ok(m.q('select').querySelectorAll('option').length >= 2);
  assert.ok(m.qa('select').some((s) => s.querySelectorAll('option').length > 200), 'country select lists the countries');
  assert.equal(m.qa('input[type=checkbox]').length, 3); // two services + the consent box
  m.unmount();
});

test('typing updates the values and blank answers are removed', async () => {
  const m = mount();
  await typeInto(m, 'Full name', 'Ann Lee');
  assert.deepEqual(m.state.values, { full_name: 'Ann Lee' });
  await typeInto(m, 'Full name', '');
  assert.deepEqual(m.state.values, {});
  m.unmount();
});

test('yes/no, multiselect and checklist write the right shapes', async () => {
  const m = mount();
  const radios = m.qa('input[type=radio]');
  const byName = (n) => radios.filter((r) => r.nextElementSibling?.textContent === n);
  byName('No')[0].click(); // the PEP question comes first
  await m.flush();
  assert.equal(m.state.values.pep, false);
  m.qa('input[type=checkbox]')[0].click();
  await m.flush();
  m.qa('input[type=checkbox]')[1].click();
  await m.flush();
  assert.deepEqual(m.state.values.services, ['a', 'b']);
  byName('Yes')[1].click(); // checklist q1 -> yes
  await m.flush();
  assert.deepEqual(m.state.values.checks, { q1: true });
  m.unmount();
});

test('visibleIf shows and hides a field live, for fields and for group-row fields', async () => {
  const m = mount();
  assert.ok(!m.text().includes('Company name'));
  m.state.values = { kind: 'co' };
  await m.flush();
  assert.ok(m.text().includes('Company name'));
  button(m, 'Add owner').click();
  await m.flush();
  assert.ok(!m.text().includes('Note'));
  m.state.values = { ...m.state.values, owners: [{ role: 'dir' }] };
  await m.flush();
  assert.ok(m.text().includes('Note'));
  m.unmount();
});

test('group rows add and remove, respect the max, and show row errors', async () => {
  const m = mount();
  button(m, 'Add owner').click();
  await m.flush();
  assert.deepEqual(m.state.values.owners, [{}]);
  button(m, 'Add owner').click();
  await m.flush();
  assert.equal(m.state.values.owners.length, 2);
  assert.equal(button(m, 'Add owner').disabled, true); // max 2
  m.state.errors = [{ key: 'owners', row: 1, field: 'name', message: 'This is required.' }, { key: 'full_name', message: 'This is required.' }];
  await m.flush();
  assert.equal(m.qa('p').filter((p) => p.textContent === 'This is required.').length, 2);
  m.q('button[aria-label="Remove Owner 1"]').click();
  await m.flush();
  assert.equal(m.state.values.owners.length, 1);
  m.unmount();
});

test('a top-level error shows under its field and scrollToFirstError focuses it', async () => {
  const m = mount({ errors: [{ key: 'full_name', message: 'This is required.' }] });
  assert.ok(m.text().includes('This is required.'));
  const input = m.q('[aria-invalid="true"]');
  assert.ok(input);
  await m.renderer.scrollToFirstError();
  assert.equal(document.activeElement, input);
  m.unmount();
});

test('file fields upload through the uploader and emit the attachment list, with rules', async () => {
  const calls = [];
  const m = mount({ uploader: async (file, key) => { calls.push([file.name, key]); return { key: `tmp/${file.name}`, name: file.name }; } });
  const input = m.q('input[type=file]');
  const pick = async (files) => { Object.defineProperty(input, 'files', { value: files, configurable: true }); input.dispatchEvent(new Event('change')); await new Promise((r) => setTimeout(r, 10)); await m.flush(); };
  await pick([new File(['x'], 'id.pdf', { type: 'application/pdf' })]);
  assert.deepEqual(calls, [['id.pdf', 'id_copy']]);
  assert.deepEqual(m.state.attachments.map(({ key, name, fieldKey }) => ({ key, name, fieldKey })), [{ key: 'tmp/id.pdf', name: 'id.pdf', fieldKey: 'id_copy' }]);
  assert.ok(m.text().includes('id.pdf'));
  await pick([new File(['x'], 'run.exe', { type: 'application/x-msdownload' })]);
  assert.ok(m.text().includes('Use a PNG, JPEG, WebP or PDF file.'));
  assert.equal(calls.length, 1);
  m.q('button[aria-label="Remove id.pdf"]').click();
  await m.flush();
  assert.equal(m.state.attachments.length, 0);
  m.unmount();
});

test('signature writes { name, consent }', async () => {
  const m = mount();
  await typeInto(m, 'Signature', 'Ann Lee');
  assert.deepEqual(m.state.values.sign, { name: 'Ann Lee', consent: false });
  m.qa('input[type=checkbox]').at(-1).click();
  await m.flush();
  assert.deepEqual(m.state.values.sign, { name: 'Ann Lee', consent: true });
  m.unmount();
});

test('readonly shows answers as text; a public audience never shows internal fields', async () => {
  const values = { full_name: 'Ann Lee', kind: 'co', company_name: 'Acme', pep: true, services: ['a', 'b'], nationality: 'SG', owners: [{ name: 'O' }], risk: 'low' };
  const m = mount({ values, readonly: true, attachments: [{ id: 'A1', name: 'id.pdf', fieldKey: 'id_copy' }] });
  const t = m.text();
  for (const s of ['Ann Lee', 'Company', 'Acme', 'Yes', 'Alpha, Beta', 'Singapore', 'id.pdf', 'Low']) assert.ok(t.includes(s), `missing "${s}"`);
  assert.equal(m.qa('input').length, 0);
  m.state.audience = 'public';
  await m.flush();
  assert.ok(!m.text().includes('Risk rating') && !m.text().includes('Officer use'));
  m.unmount();
});
