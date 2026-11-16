// One-off: turns the AGM sample block sets from the corpsec repo (infra/word-to-pdf/docx
// assets/json/sample.js: sampleAGM, sampleAGM1) into paprcraft master-template seeds, written to
// backend/api/src/scripts/masters/*.json (imported by backend/api/src/scripts/seed-master-templates.js).
// It removes real client data (company names, registration no., dates, signer names) in favour of
// {{PLACEHOLDER}} chips, drops test junk, maps unsupported blocks, and regenerates each cell's html
// from the cleaned delta with the editor's own Quill setup, so the editor and the docx renderer agree.
//
//   node scripts/build-master-seeds.mjs /path/to/sample.js
import { JSDOM } from 'jsdom';
import { writeFileSync, mkdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { nanoid } from 'nanoid';

const dom = new JSDOM('<!doctype html><body></body>', { pretendToBeVisual: true });
for (const k of ['window', 'document', 'navigator', 'Node', 'Element', 'HTMLElement', 'MutationObserver', 'getSelection', 'CustomEvent', 'Event', 'DOMParser', 'NodeFilter', 'Text', 'Range']) {
  if (dom.window[k] !== undefined) Object.defineProperty(globalThis, k, { value: dom.window[k], configurable: true, writable: true });
}
document.getSelection ??= () => dom.window.getSelection();
const Q = await import('../src/helpers/template/quill.js');

const src = process.argv[2];
if (!src) { console.error('usage: node scripts/build-master-seeds.mjs /path/to/sample.js'); process.exit(1); }
const { sampleAGM, sampleAGM1 } = await import(pathToFileURL(src).href);

const keys = new Set();
const normKey = (k) => String(k ?? '').replace(/[​﻿]/g, '').trim().replace(/\s+/g, '_').toUpperCase().replace(/^REGISTERED_NO$/, 'REGISTRATION_NO');
const chip = (key, attributes = {}) => { const k = normKey(key); keys.add(k); return { insert: { text: k, value: '' }, attributes: { ...attributes, placeholder: true } }; };

// Real values in the samples -> the placeholder that should have been there.
const REPLACE = [
  [/IOIOLAB PTE\. LTD\./g, 'COMPANY_NAME'],
  [/MEYZER MANAGEMENT ADVISORY PTE\. LTD\./gi, 'SECRETARIAL_AGENT'],
  [/\b234760023C\b/g, 'REGISTRATION_NO'],
  [/\b\d{2}\/\d{2}\/\d{4}\b/g, 'DATE'],
  [/[​﻿]*\{\{\s*([A-Za-z0-9_ ]+?)\s*\}\}[​﻿]*/g, null], // typed {{KEY}} -> a chip
];
const clean = (s) => s.replace(/[​﻿]/g, '').replace('CHANG OF', 'CHANGE OF');

const textAttrs = (a) => { const { placeholder, ...rest } = a ?? {}; return Object.keys(rest).length ? rest : undefined; };
const splitString = (str, rawAttributes) => {
  const attributes = textAttrs(rawAttributes);
  const out = [];
  let rest = str;
  while (rest) {
    let best = null;
    for (const [re, key] of REPLACE) {
      re.lastIndex = 0;
      const m = re.exec(rest);
      if (m && (!best || m.index < best.m.index)) best = { m, key: key ?? m[1] };
    }
    if (!best) { out.push({ insert: clean(rest), ...(attributes && { attributes }) }); break; }
    if (best.m.index) out.push({ insert: clean(rest.slice(0, best.m.index)), ...(attributes && { attributes }) });
    out.push(chip(best.key, attributes));
    rest = rest.slice(best.m.index + best.m[0].length);
  }
  return out.filter((o) => o.insert !== '');
};

const cleanOps = (ops = []) => ops.flatMap((op) => {
  if (typeof op.insert === 'string') return splitString(op.insert, op.attributes);
  if (op.insert?.text !== undefined) return [chip(op.insert.text, { ...op.attributes })]; // value cleared
  return [op];
});

const quillFor = () => { const el = document.createElement('div'); document.body.appendChild(el); return new Q.Quill(el, { formats: Q.EDITOR_FORMATS, modules: { toolbar: false } }); };
// { text, delta } -> cleaned, with html regenerated from the delta.
const cleanCell = (cell) => {
  if (!cell?.delta?.ops) return cell?.text ? { text: '', delta: null } : cell;
  const q = quillFor();
  // Quill takes an embed as { insert: { placeholder: {text,value} } }; editorDelta writes the stored shape back.
  const forQuill = cleanOps(cell.delta.ops).map((o) => (o.insert?.text !== undefined ? { insert: { placeholder: o.insert }, ...(textAttrs(o.attributes) && { attributes: textAttrs(o.attributes) }) } : o));
  q.setContents({ ops: forQuill }, 'silent');
  return { text: Q.editorHtml(q), delta: Q.editorDelta(q) };
};
const cleanText = (s) => (typeof s === 'string' ? splitHeaderText(s) : s);
const splitHeaderText = (s) => { // header fields hold "{{KEY}}" strings, not chips
  let t = clean(s);
  for (const [re, key] of REPLACE.slice(0, 4)) t = t.replace(re, `{{${key}}}`);
  return t.replace(/\{\{\s*([A-Za-z0-9_ ]+?)\s*\}\}/g, (_, k) => `{{${normKey(k)}}}`);
};

const cleanBlock = (b) => {
  const id = b.id || nanoid();
  const t = b.type;
  if (t === 'paragraph' || t === 'list-item-paragraph') return { id, type: t, item: cleanCell(b.item ?? {}) };
  if (t === 'list') return { id, type: t, item: (b.item ?? []).map(cleanBlock).filter(Boolean) };
  if (/^table-0\d$/.test(t)) return { id, type: t, item: { ...b.item, data: (b.item?.data ?? []).map((row) => Object.fromEntries(Object.entries(row).map(([c, cell]) => [c, cleanCell(cell)]))) } };
  if (t === 'layout-company-header-01') {
    const d = b.item?.data ?? {};
    keys.add('COMPANY_NAME'); keys.add('REGISTRATION_NO');
    return { id, type: t, item: { data: { subHeader: cleanText(d.subHeader), companyName: '{{COMPANY_NAME}}', companyRegNo: '{{REGISTRATION_NO}}' } } };
  }
  if (t === 'layout-corpsec-header-01') { keys.add('SECRETARIAL_AGENT'); return { id, type: t, item: { data: { companyName: '{{SECRETARIAL_AGENT}}' } } }; }
  if (t === 'sign-area-01') return { id, type: t, item: { data: { desc: b.item?.data?.desc ?? 'DIRECTOR(S)', signers: [] } } };
  if (t === 'sign-area-director') return { id, type: 'sign-area-01', item: { data: { desc: 'SHAREHOLDER(S)', signers: [] } } };
  if (t === 'sign-area-04') return { id, type: t, item: { data: { desc: b.item?.data?.desc ?? null, name: null, desc2: b.item?.data?.desc2 ?? null } } };
  return { id, type: t, item: b.item };
};
const isJunk = (b) => b.type === 'table-03' && JSON.stringify(b).includes('"jay');

const build = (name, sections) => {
  keys.clear();
  const section = sections.map((s) => ({ name: s.name, list: s.list.filter((b) => !isJunk(b)).map(cleanBlock) }));
  const placeholders = Object.fromEntries([...keys].sort().map((k) => [k, '']));
  return { name, section, placeholders };
};

const masters = [
  build('AGM: resolutions and ACRA notices', sampleAGM),
  build('AGM pack: audited accounts, corporate shareholder', sampleAGM1),
];

// Anything real left? Refuse to write.
const FORBIDDEN = /IOIOLAB|SUPREME|MEYZER|ALAN TAN|BRYAN SU|CLARICE|DON LIM|JAMES (LEE|DEAN)|LOY|YOKE|234760023C|GOOD YEAR|USJ|(?<!layout-)corpsec(?!-header)/i;
for (const m of masters) {
  const hit = JSON.stringify(m).match(FORBIDDEN);
  if (hit) { console.error(`REFUSING: "${hit[0]}" is still in "${m.name}"`); process.exit(1); }
}

const outDir = new URL('../../../backend/api/src/scripts/masters/', import.meta.url);
mkdirSync(outDir, { recursive: true });
const files = ['agm-resolutions-and-notices.json', 'agm-pack-corporate-shareholder.json'];
masters.forEach((m, i) => {
  writeFileSync(new URL(files[i], outDir), JSON.stringify(m, null, 2) + '\n');
  console.log(`${files[i]}: "${m.name}", ${m.section.length} sections, placeholders: ${Object.keys(m.placeholders).join(', ')}`);
});
process.exit(0);
