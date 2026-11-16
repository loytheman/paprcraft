// How chips draw in the editor: manual keys in upper case, form fields exactly as typed, with their formatter.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><body></body>', { pretendToBeVisual: true });
for (const k of ['window', 'document', 'navigator', 'Node', 'Element', 'HTMLElement', 'MutationObserver', 'getSelection', 'CustomEvent', 'Event', 'DOMParser', 'NodeFilter', 'Text', 'Range']) {
  if (dom.window[k] !== undefined) Object.defineProperty(globalThis, k, { value: dom.window[k], configurable: true, writable: true });
}
document.getSelection ??= () => dom.window.getSelection();

let Q;
before(async () => { Q = await import('../src/helpers/template/quill.js'); Q.setPlaceholderResolver(() => ''); });
const make = () => {
  const el = document.createElement('div');
  document.body.appendChild(el);
  return new Q.Quill(el, { formats: Q.EDITOR_FORMATS, modules: { toolbar: false } });
};
const shown = (quill) => [...quill.root.querySelectorAll('.q-placeholder')].map((n) => n.textContent);

test('a manual key shows upper case, a form field shows as typed with its formatter', () => {
  const quill = make();
  quill.insertEmbed(0, 'placeholder', { text: 'CLIENT', value: '' }, 'user');
  quill.insertEmbed(1, 'placeholder', { text: 'dob|date', value: '' }, 'user');
  quill.insertEmbed(2, 'placeholder', { text: 'owners.name', value: '' }, 'user');
  quill.insertEmbed(3, 'placeholder', { text: 'owners.#', value: '' }, 'user');
  assert.deepEqual(shown(quill), ['{{CLIENT}}', '{{dob|date}}', '{{owners.name}}', '{{owners.#}}']);
});

test('a form field chip keeps its text through the html round trip', () => {
  const quill = make();
  quill.insertText(0, 'Born ');
  quill.insertEmbed(5, 'placeholder', { text: 'dob|date', value: '' }, 'user');
  const html = Q.editorHtml(quill);
  assert.ok(html.includes('data-text="dob|date"'));
  const again = make();
  again.setContents(Q.htmlToDelta(again, html), 'silent');
  const chip = Q.editorDelta(again).ops.find((o) => typeof o.insert === 'object');
  assert.deepEqual(chip.insert, { text: 'dob|date', value: '' });
  assert.equal(chip.attributes.placeholder, true);
});

test('a value from the resolver replaces the chip text, whatever the formatter', () => {
  Q.setPlaceholderResolver((k) => (k === 'full_name' ? 'Ann Lee' : ''));
  const quill = make();
  quill.insertEmbed(0, 'placeholder', { text: 'full_name', value: '' }, 'user');
  assert.deepEqual(shown(quill), ['Ann Lee']);
  Q.setPlaceholderResolver(() => '');
});
