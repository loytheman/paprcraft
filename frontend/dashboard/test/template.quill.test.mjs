// The Quill side of the template editor, run in jsdom: the placeholder chip's delta shape (what the
// docx renderer reads), the HTML round trip, live values from the placeholder map, sizes.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><body></body>', { pretendToBeVisual: true });
for (const k of ['window', 'document', 'navigator', 'Node', 'Element', 'HTMLElement', 'MutationObserver', 'getSelection', 'CustomEvent', 'Event', 'DOMParser', 'NodeFilter', 'Text', 'Range']) {
  if (dom.window[k] !== undefined) Object.defineProperty(globalThis, k, { value: dom.window[k], configurable: true, writable: true });
}
document.getSelection ??= () => dom.window.getSelection();

let Q;
before(async () => { Q = await import('../src/helpers/template/quill.js'); });

const make = (html = '') => {
  const el = document.createElement('div');
  document.body.appendChild(el);
  const quill = new Q.Quill(el, { formats: Q.EDITOR_FORMATS, modules: { toolbar: false } });
  if (html) quill.setContents(Q.htmlToDelta(quill, html), 'silent');
  return quill;
};

test('an inserted placeholder is saved as { insert: { text, value }, attributes: { placeholder: true } }', () => {
  const quill = make();
  quill.insertText(0, 'Dear ');
  quill.insertEmbed(5, 'placeholder', { text: 'CLIENT', value: '' }, 'user');
  const ops = Q.editorDelta(quill).ops;
  const chip = ops.find((o) => typeof o.insert === 'object');
  assert.deepEqual(chip.insert, { text: 'CLIENT', value: '' });
  assert.equal(chip.attributes.placeholder, true);
  assert.equal(quill.root.querySelector('.q-placeholder').textContent, '{{CLIENT}}');
});

test('the html reloads into the same chip', () => {
  const quill = make();
  quill.insertText(0, 'Hello ');
  quill.insertEmbed(6, 'placeholder', { text: 'NAME', value: '' }, 'user');
  const html = Q.editorHtml(quill);
  assert.ok(!html.includes('﻿'));
  const again = make(html);
  const chip = Q.editorDelta(again).ops.find((o) => typeof o.insert === 'object');
  assert.deepEqual(chip.insert, { text: 'NAME', value: '' });
  assert.equal(chip.attributes.placeholder, true);
});

test('chips show the placeholder map live, and fall back to {{KEY}}', () => {
  const quill = make();
  quill.insertEmbed(0, 'placeholder', { text: 'CITY', value: '' }, 'user');
  const node = quill.root.querySelector('.q-placeholder');
  assert.equal(node.textContent, '{{CITY}}');
  assert.ok(!node.classList.contains('has-value'));
  const map = { CITY: 'Singapore' };
  Q.setPlaceholderResolver((k) => map[k]);
  Q.refreshChips(quill);
  assert.equal(node.textContent, 'Singapore');
  assert.ok(node.classList.contains('has-value'));
  map.CITY = '';
  Q.refreshChips(quill);
  assert.equal(node.textContent, '{{CITY}}');
  // the stored delta never holds the map's value
  assert.equal(Q.editorDelta(quill).ops.find((o) => typeof o.insert === 'object').insert.value, '');
  Q.setPlaceholderResolver(null);
});

test('formats: bold, strike and the size classes survive a round trip', () => {
  const quill = make();
  quill.insertText(0, 'big bold');
  quill.formatText(0, 8, 'size', 'xl');
  quill.formatText(0, 3, 'bold', true);
  quill.formatText(4, 4, 'strike', true);
  const html = Q.editorHtml(quill);
  assert.match(html, /q-size-xl/);
  const again = Q.editorDelta(make(html)).ops;
  assert.ok(again.some((o) => o.attributes?.bold && o.attributes?.size === 'xl'));
  assert.ok(again.some((o) => o.attributes?.strike));
});

test('an empty paragraph keeps its line when reloaded', () => {
  const quill = make('<p>one</p><p></p><p>two</p>');
  assert.equal(quill.getText().split('\n').length, 4); // one, blank, two, trailing
});
