// Quill 2 setup for the template editor, ported from the corpsec editor:
//   - `size` class attributor (q-size-xs ... q-size-xl), the six text sizes
//   - `placeholder` embed blot: a {{KEY}} chip. Its delta op is { insert: { text: KEY, value },
//     attributes: { placeholder: true } }, which backend/lambda/docxTemplate.js reads. The chip shows
//     its own `value` if it has one, else the value of KEY in the template's placeholder map (set
//     with setPlaceholderResolver, so editing the map updates every chip live), else {{KEY}}.
// Importing this file registers both formats (once).
import Quill from 'quill';

const Parchment = Quill.import('parchment');
const Embed = Quill.import('blots/embed');

export const SIZES = [
  { label: 'x-large', value: 'xl' },
  { label: 'large', value: 'lg' },
  { label: 'normal', value: 'base' },
  { label: 'medium', value: 'md' },
  { label: 'small', value: 'sm' },
  { label: 'x-small', value: 'xs' },
];
export const EDITOR_FORMATS = ['size', 'bold', 'italic', 'underline', 'strike', 'placeholder'];

const SizeClass = new Parchment.ClassAttributor('size', 'q-size', {
  scope: Parchment.Scope.INLINE,
  whitelist: SIZES.map((s) => s.value),
});

let resolveValue = () => '';
// fn(key) -> the value for that key ('' if none).
export const setPlaceholderResolver = (fn) => { resolveValue = typeof fn === 'function' ? fn : () => ''; };

const readAttrs = (node) => ({ text: node.getAttribute('data-text') ?? '', value: node.getAttribute('data-value') ?? '' });

class PlaceholderBlot extends Embed {
  static blotName = 'placeholder';
  static tagName = 'span';
  static className = 'q-placeholder';

  static create(value) {
    const node = super.create(value);
    node.setAttribute('data-text', value?.text ?? '');
    node.setAttribute('data-value', value?.value ?? '');
    PlaceholderBlot.render(node);
    return node;
  }

  static formats() {
    return { placeholder: true };
  }

  // From a node (HTML paste, reload): what the delta op's insert holds.
  static value(node) {
    return readAttrs(node);
  }

  // Draws the chip's text and state from its attributes (and the resolver).
  static render(node) {
    const { text, value } = readAttrs(node);
    const shown = value || resolveValue(text) || '';
    node.classList.toggle('has-value', !!shown);
    node.setAttribute('contenteditable', 'false');
    node.textContent = shown || `{{${text.toUpperCase()}}}`;
  }

  constructor(scroll, node) {
    super(scroll, node);
    PlaceholderBlot.render(node);
    node.addEventListener('click', (e) => {
      e.preventDefault();
      window.dispatchEvent(new CustomEvent('placeholder-clicked', { detail: { blot: this, ...readAttrs(node), event: e } }));
    });
  }

  value() {
    return readAttrs(this.domNode);
  }

  // The chip's character position in its editor.
  index() {
    return this.offset(this.scroll);
  }
}

Quill.register(SizeClass, true);
Quill.register(PlaceholderBlot, true);

// Redraws every chip of an editor (after the placeholder map changed).
export const refreshChips = (quill) => {
  try {
    quill?.root?.querySelectorAll('.q-placeholder').forEach((node) => PlaceholderBlot.render(node));
  } catch { /* an editor being torn down */ }
};

const GUARD = /﻿/g;
// What gets stored next to the delta: the editor's HTML. Chips are rewritten to plain spans so the
// guard characters Quill puts inside embeds never reach the database.
export const editorHtml = (quill) => quill.getSemanticHTML().replace(GUARD, '');
export const editorDelta = (quill) => ({ ops: JSON.parse(JSON.stringify(quill.getContents().ops)) });

// HTML -> delta, the way corpsec reloaded text: empty paragraphs keep a line.
export const htmlToDelta = (quill, html) => quill.clipboard.convert({ html: String(html ?? '').replace(/<p>(\s*?)<\/p>/g, '<p>&nbsp;</p>') });

export { Quill, PlaceholderBlot };
