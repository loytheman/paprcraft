// Pure helpers for the template editor: block factories, tree lookups, placeholder counting and
// renaming, section moves. No Vue or Quill in here, so it is unit-tested (test/template.blocks.test.mjs).
//
// A template is { name, section: [{ name, list: [block] }], placeholders: { KEY: "value" } }.
// A block is { id, type, item }, the corpsec JSON shape; the docx renderer
// (backend/lambda/docxRender.js, read its header comment) consumes exactly this:
//   paragraph / list-item-paragraph   item: { text (html), delta: { ops } }
//   list                              item: [list-item-paragraph | list blocks] (nestable)
//   table-01 / 02 / 03                item: { data: [{ col1, col2, col3? }], options? }, cell = { text, delta }
//   page-break                        item: { data: {} }
//   page-break-02                     item: { data: { footerPageNo, headerPageNo } }   ("-N-" at the top of the next page, ".../M" at the foot)
//   layout-company-header-01          item: { data: { companyName, companyRegNo, subHeader, incorporationLine? } }
//   layout-corpsec-header-01          item: { data: { companyName, companyRegNo, subHeader } }   (letterhead; subHeader: one line per \n)
//   layout-company-act                item: { data: { title?, subHeader } }
//   layout-form-45b                   item: { data: { title?, subHeader? } }
//   sign-area-01                      item: { data: { desc, signers: [{ name }] } }
//   sign-area-02                      item: { data: { name, desc } }
//   sign-area-03                      item: { data: { name, desc, desc2 } }
//   sign-area-04                      item: { data: { desc, name, desc2, desc3 } }
//   repeat                            item: { group, list: [block] }   renders `list` once per row of the form's repeating group `group`
//   if                                item: { cond, list: [block] }     renders `list` only when `cond` (the forms' visibleIf shape) holds
//   table-0x with item.repeatGroup    the first data row is repeated once per row of that group
//   form-table                        item: { title, rows: [{ repeat?, stack?, cells: [{ label?, value, list?, col?, head? }] }] }   a section table (grey title row, label-over-value cells; head = a small column title: value only, may be empty)
//   form-checklist                    item: { title, subtitle?, rows: [{ text, value }] }   numbered questions with Yes/No checkboxes; value is a "{{field.optionKey}}" token
//   form-declaration                  item: { title?, text?, signatureLabel?, nameLabel?, dateLabel?, signer? }   the declaration box with signature lines
//   (the three blocks above keep "{{key|pipe}}" tokens as plain text in their strings, like the header and signature blocks)
// Template-level page setup, saved next to `section`: style ('letter' | 'form') and frame ({ headerLeft, headerRight, footerLeft }).
// Placeholders are Quill embeds: a delta op { insert: { text, value }, attributes: { placeholder: true } }.
// `text` is a manual KEY ("COMPANY_NAME"), or, for a field of the template's form, the field key with
// an optional formatter: "full_name", "dob|date", "owners.name" (inside a repeat of `owners`),
// "owners.#" (the row number).
import { nanoid } from 'nanoid';

export const uid = () => nanoid();

export const TEXT_TYPES = ['paragraph', 'list-item-paragraph'];
export const TABLE_TYPES = ['table-01', 'table-02', 'table-03', 'table-04']; // table-04 is only rendered if it exists (older templates); the editor offers 01-03
export const SIGN_TYPES = ['sign-area-01', 'sign-area-02', 'sign-area-03', 'sign-area-04'];
// Blocks that only make sense at the top level of a section.
export const FORM_BLOCK_TYPES = ['form-table', 'form-checklist', 'form-declaration'];
export const ROOT_ONLY_TYPES = ['form-table', 'form-checklist', 'form-declaration', 'layout-corpsec-header-01', 'layout-company-header-01', 'layout-company-act', 'layout-form-45b', 'sign-area-01', 'sign-area-02', 'sign-area-03', 'sign-area-04', 'page-break', 'page-break-02'];

export const CONTAINER_TYPES = ['repeat', 'if'];
// Page breaks always sit at the top level of a section, never inside a repeat / if.
export const PAGE_BREAK_TYPES = ['page-break', 'page-break-02'];
export const PIPES = ['yesno', 'date', 'upper', 'lower', 'list', 'country'];

export const isContainer = (b) => CONTAINER_TYPES.includes(b?.type) && Array.isArray(b?.item?.list);
// The blocks nested inside a block (a list's items, a container's blocks), or null.
export const childList = (b) => (b?.type === 'list' && Array.isArray(b.item) ? b.item : isContainer(b) ? b.item.list : null);

export const emptyCell = () => ({ text: '', delta: '' });
export const tableCols = (type) => (type === 'table-04' ? ['col1', 'col2', 'col3', 'col4'] : type === 'table-03' ? ['col1', 'col2', 'col3'] : ['col1', 'col2']);
export const emptyRow = (type) => Object.fromEntries(tableCols(type).map((c) => [c, emptyCell()]));

// Makes sure every row has the columns its table type shows (switching 01 -> 03 adds col3).
export const ensureTableCols = (rows, type) => {
  for (const row of rows) for (const c of tableCols(type)) if (!row[c]) row[c] = emptyCell();
  return rows;
};

export const signDefaults = (type) => {
  if (type === 'sign-area-02') return { name: '', desc: 'Director' };
  if (type === 'sign-area-03') return { name: '', desc: 'Corporate Representative of Holding Company', desc2: '' };
  if (type === 'sign-area-04') return { desc: 'SHAREHOLDER', name: '', desc2: 'Corporate Representative of Holding Company', desc3: '' };
  return { desc: 'DIRECTOR(S)', signers: [] };
};

export const defaultItem = (type) => {
  switch (type) {
    case 'paragraph':
    case 'list-item-paragraph': return { text: '' };
    case 'list': return [{ id: uid(), type: 'list-item-paragraph', item: { text: '' } }];
    case 'repeat': return { group: '', list: [{ id: uid(), type: 'paragraph', item: { text: '' } }] };
    case 'if': return { cond: { key: '', op: 'notEmpty' }, list: [{ id: uid(), type: 'paragraph', item: { text: '' } }] };
    case 'layout-company-header-01': return { data: { companyName: '', companyRegNo: '', subHeader: '', incorporationLine: '' } };
    case 'layout-company-act': return { data: { title: '', subHeader: '' } };
    case 'layout-corpsec-header-01': return { data: { companyName: '', companyRegNo: '', subHeader: '' } };
    case 'layout-form-45b': return { data: { title: '', subHeader: '' } };
    case 'form-table': return formTableDefault();
    case 'form-checklist': return checklistDefault();
    case 'form-declaration': return declarationDefault();
    case 'page-break': return { data: {} };
    case 'page-break-02': return { data: { footerPageNo: '2', headerPageNo: '2' } };
    default:
      if (SIGN_TYPES.includes(type)) return { data: signDefaults(type) };
      if (TABLE_TYPES.includes(type)) return { data: [emptyRow(type), emptyRow(type)] };
      return {};
  }
};

export const newBlock = (type) => ({ id: uid(), type, item: defaultItem(type) });
// A repeat / if with its settings filled in: newContainer('repeat', { group: 'owners' }), newContainer('if', { cond }).
export const newContainer = (type, { group, cond } = {}) => {
  const b = newBlock(type);
  if (type === 'repeat') b.item.group = group ?? '';
  else if (cond) b.item.cond = cond;
  return b;
};

// Deep copy with fresh ids (a cloned block must not share an id, ids name the editors).
export const cloneBlock = (block) => {
  const copy = JSON.parse(JSON.stringify(block));
  const fresh = (b) => {
    b.id = uid();
    childList(b)?.forEach(fresh);
  };
  fresh(copy);
  return copy;
};

// Every block carries an id (the DB rows from older editors may not).
export const ensureIds = (list) => {
  for (const b of list ?? []) {
    if (!b.id) b.id = uid();
    const kids = childList(b);
    if (kids) ensureIds(kids);
  }
  return list;
};

// Index path to the block with this id: [2] at the top, [2, 0] inside the list / container at index 2. null if absent.
export const findPath = (list, id, prefix = []) => {
  for (let i = 0; i < (list?.length ?? 0); i++) {
    const b = list[i];
    if (b.id === id) return [...prefix, i];
    const kids = childList(b);
    if (kids) {
      const inner = findPath(kids, id, [...prefix, i]);
      if (inner) return inner;
    }
  }
  return null;
};

const arrayAt = (list, path) => path.slice(0, -1).reduce((arr, i) => childList(arr[i]), list);
export const blockAt = (list, path) => arrayAt(list, path)[path[path.length - 1]];

// The blocks that enclose the block with this id (outermost first), the block itself last.
export const pathBlocks = (list, id) => {
  const path = findPath(list, id);
  if (!path) return [];
  const out = [];
  let arr = list;
  for (const i of path) { out.push(arr[i]); arr = childList(arr[i]) ?? []; }
  return out;
};

// The repeating group in force at the focused block: inside a repeat, or on a table that repeats
// its first row. '' when none. (Decides which row fields the field picker offers.)
export const repeatGroupAt = (list, focusId) => {
  for (const b of pathBlocks(list, focusId)) {
    if (b.type === 'repeat' && b.item?.group) return b.item.group;
    if (TABLE_TYPES.includes(b.type) && b.item?.repeatGroup) return b.item.repeatGroup;
  }
  return '';
};
// True when a repeat block can't be added at the focus (it is already inside one).
export const insideRepeat = (list, focusId) => pathBlocks(list, focusId).some((b) => b.type === 'repeat');

// Inserts `block` relative to the focused block (or at the end).
//  - text and list blocks go next to the focus, even inside a list;
//  - a focused repeat / if takes the block inside, at its end;
//  - headers, signatures, tables and containers go below the focused block's nearest enclosing
//    section or repeat / if, never inside a list;
//  - page breaks go below the top-level block that holds the focus, never inside a repeat / if.
export const insertAfterFocus = (list, focusId, block) => {
  const path = focusId ? findPath(list, focusId) : null;
  if (!path) {
    list.push(block);
    return;
  }
  if (PAGE_BREAK_TYPES.includes(block.type)) {
    list.splice(path[0] + 1, 0, block);
    return;
  }
  const focused = blockAt(list, path);
  if (isContainer(focused)) {
    focused.item.list.push(block);
    return;
  }
  if (ROOT_ONLY_TYPES.includes(block.type) || TABLE_TYPES.includes(block.type) || CONTAINER_TYPES.includes(block.type)) {
    let arr = list;
    let owner = null;
    let best = null;
    for (let k = 0; k < path.length; k++) {
      if (k === 0 || isContainer(owner)) best = { arr, idx: path[k] };
      owner = arr[path[k]];
      arr = childList(owner) ?? [];
    }
    best.arr.splice(best.idx + 1, 0, block);
    return;
  }
  arrayAt(list, path).splice(path[path.length - 1] + 1, 0, block);
};

// Moves an array item; returns the same array.
export const moveItem = (arr, from, to) => {
  if (from === to || from < 0 || to < 0 || from >= arr.length || to >= arr.length) return arr;
  const [item] = arr.splice(from, 1);
  arr.splice(to, 0, item);
  return arr;
};
// Where the item that was at `current` ends up after moveItem(arr, from, to).
export const indexAfterMove = (current, from, to) => {
  if (current === from) return to;
  if (from < current && to >= current) return current - 1;
  if (from > current && to <= current) return current + 1;
  return current;
};

// ---- placeholders -------------------------------------------------------------------------

export const normalizeKey = (s) => String(s ?? '').trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');

// Calls fn(block) for every block, lists and repeat / if containers included (depth first).
export const forEachBlock = (list, fn) => {
  for (const b of list ?? []) {
    fn(b);
    const kids = childList(b);
    if (kids) forEachBlock(kids, fn);
  }
};

// Calls fn(cell, ownerBlock) for every editable text cell: paragraph / list items / table cells.
export const forEachCell = (list, fn) => {
  for (const b of list ?? []) {
    const kids = childList(b);
    if (kids) forEachCell(kids, fn);
    else if (TEXT_TYPES.includes(b.type)) fn(b.item, b);
    else if (TABLE_TYPES.includes(b.type)) for (const row of b.item?.data ?? []) for (const k of Object.keys(row)) fn(row[k], b);
  }
};

const placeholderOps = (cell) => (cell?.delta?.ops ?? []).filter((op) => op?.attributes?.placeholder && op.insert && typeof op.insert === 'object');

// Chip text -> { base, pipe }: "dob|date" -> { base: 'dob', pipe: 'date' }; "COMPANY" -> { base: 'COMPANY', pipe: '' }.
export const parseChip = (text) => {
  const [base, ...rest] = String(text ?? '').split('|');
  return { base: base.trim(), pipe: rest.join('|').trim() };
};
export const chipText = (base, pipe = '') => (pipe ? `${base}|${pipe}` : base);

// A chip is "replaced" when it has a value of its own, its key has one in `values`, or it is a field
// of the template's form (filled from the submission when the document is generated).
export const countPlaceholders = (list, values = {}, formKeys = null) => {
  let total = 0;
  let replaced = 0;
  forEachCell(list, (cell) => {
    for (const op of placeholderOps(cell)) {
      total++;
      const { base } = parseChip(op.insert.text);
      if (op.insert.value || values[op.insert.text] || values[base] || formKeys?.has(base) || BUILTIN_KEYS.has(base)) replaced++;
    }
  });
  // {{tokens}} in the section table, checklist and declaration blocks count the same way.
  // (a token's first segment is the field: "risk.q1" is the answer q1 of the field risk)
  forEachToken(list, (t) => { total++; if (values[t.base] || formKeys?.has(t.base.split('.')[0]) || BUILTIN_KEYS.has(t.base)) replaced++; });
  return { total, replaced };
};

// How many times each key is used across the given sections: { key: n }. A formatter ("dob|date")
// counts for its key ("dob").
export const placeholderUsage = (sections, frame = null) => {
  const out = {};
  for (const s of sections ?? []) {
    forEachCell(s.list, (cell) => { for (const op of placeholderOps(cell)) { const { base } = parseChip(op.insert.text); out[base] = (out[base] ?? 0) + 1; } });
    forEachToken(s.list, (t) => { out[t.base] = (out[t.base] ?? 0) + 1; });
  }
  forEachToken([], (t) => { out[t.base] = (out[t.base] ?? 0) + 1; }, frame); // the page frame's tokens
  return out;
};

// A manual placeholder key (COMPANY_NAME), as opposed to a form field ("full_name", "dob|date",
// "owners.name", "risk.q1") or a built-in document value ({{generated_date}}).
export const isManualKey = (key, formKeys = null) => !!key && !/[a-z|.#]/.test(key) && !BUILTIN_KEYS.has(key) && !formKeys?.has(key);
// The template's manual keys: those saved in its placeholder map, plus any a chip in the text (or the
// page frame) uses, so a template whose chips were never added to the map still lists them all.
export const templateKeys = (placeholders, sections, frame = null, formKeys = null) => {
  const out = new Set(Object.keys(placeholders ?? {}));
  for (const k of Object.keys(placeholderUsage(sections, frame))) if (isManualKey(k, formKeys)) out.add(k);
  return [...out];
};

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const escapeAttr = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;');

// Renames a placeholder key in every chip (delta and html), keeping each chip's formatter
// ("dob|date" -> "born|date"). Returns how many chips changed.
export const renamePlaceholderKey = (sections, from, to) => {
  let n = 0;
  // {{from|pipe}} tokens in the form blocks follow the rename too.
  for (const s of sections ?? []) {
    forEachBlock(s.list, (b) => {
      if (!FORM_BLOCK_TYPES.includes(b.type)) return;
      const fix = (str) => { const next = renameTokensIn(str, from, to); if (next !== str) n++; return next; };
      if (b.type === 'form-table') for (const r of b.item?.rows ?? []) for (const c of r.cells ?? []) c.value = fix(c.value ?? '');
      else if (b.type === 'form-checklist') for (const r of b.item?.rows ?? []) r.value = fix(r.value ?? '');
      else if (b.item?.signer !== undefined) b.item.signer = fix(b.item.signer ?? '');
    });
  }
  const attr = /data-text="([^"]*)"/g;
  for (const s of sections ?? []) {
    forEachCell(s.list, (cell) => {
      for (const op of placeholderOps(cell)) {
        const { base, pipe } = parseChip(op.insert.text);
        if (base === from) { op.insert.text = chipText(to, pipe); n++; }
      }
      if (typeof cell.text === 'string' && cell.text.includes(from)) {
        cell.text = cell.text.replace(attr, (m, t) => {
          const { base, pipe } = parseChip(t.replace(/&quot;/g, '"').replace(/&amp;/g, '&'));
          return base === from ? `data-text="${escapeAttr(chipText(to, pipe))}"` : m;
        });
        // The text a chip shows is redrawn from data-text when the editor loads; keep the stored html readable too.
        const shownTo = /[a-z|.#]/.test(to) ? to : to.toUpperCase(); // a manual key is drawn upper case, a form field as typed
        cell.text = cell.text.replace(new RegExp(`\\{\\{${escapeRe(from)}(\\|[^}]*)?\\}\\}`, 'gi'), (m, p) => `{{${shownTo}${p ?? ''}}}`);
      }
    });
  }
  return n;
};

// ---- the template's form ------------------------------------------------------------------------------------

const SCALAR_SKIP = ['file', 'group', 'checklist'];
// Pipe a field is inserted with by default.
export const defaultPipe = (type) => ({ yesno: 'yesno', date: 'date', country: 'country', multiselect: 'list' })[type] ?? '';

// Every top-level field of a form schema: [{ key, label, type, section, options? }].
export const formFields = (schema) => (schema?.sections ?? []).flatMap((s) => (s.fields ?? []).map((f) => ({ key: f.key, label: f.label, type: f.type, section: s.title, options: f.options, group: f.group })));
// The repeating groups: [{ key, label, fields: [{ key, label, type, options? }] }].
export const formGroups = (schema) => formFields(schema).filter((f) => f.type === 'group').map((g) => ({ key: g.key, label: g.label, fields: (g.group?.fields ?? []).map((f) => ({ key: f.key, label: f.label, type: f.type, options: f.options })) }));
// Every key the form defines (for counting chips as "filled from the form").
export const formKeySet = (schema) => new Set(formFields(schema).map((f) => f.key));

// What the field picker offers: [{ section, items: [{ text, label, type, pipe }] }]. Rows of a group
// are offered only where that group repeats (`repeatGroup`), as "group.field" and "group.#".
export const pickerEntries = (schema, repeatGroup = '') => {
  const out = [];
  for (const s of schema?.sections ?? []) {
    const items = [];
    for (const f of s.fields ?? []) {
      if (f.type === 'group') {
        if (f.key !== repeatGroup) continue;
        items.push({ text: `${f.key}.#`, label: `${f.label}: row number`, type: 'number', pipe: '' });
        for (const g of f.group?.fields ?? []) items.push({ text: `${f.key}.${g.key}`, label: `${f.label}: ${g.label}`, type: g.type, pipe: defaultPipe(g.type) });
      } else if (!SCALAR_SKIP.includes(f.type)) {
        items.push({ text: f.key, label: f.label, type: f.type, pipe: defaultPipe(f.type) });
      }
    }
    if (items.length) out.push({ section: s.title, items });
  }
  return out;
};

// ---- conditions (repeat / if) -------------------------------------------------------------------------

export const OPERATORS = [
  { value: 'eq', label: 'is' },
  { value: 'neq', label: 'is not' },
  { value: 'in', label: 'is one of' },
  { value: 'empty', label: 'is empty' },
  { value: 'notEmpty', label: 'is filled in' },
  { value: 'gt', label: 'is more than' },
  { value: 'lt', label: 'is less than' },
];
export const NO_VALUE_OPS = ['empty', 'notEmpty'];

// A condition as the editor shows it: { mode: 'all' | 'any', rows: [{ key, op, value }], complex }.
// complex = nested all/any the editor can't show as rows: left untouched.
export const condToRows = (cond) => {
  if (!cond) return { mode: 'all', rows: [], complex: false };
  const list = cond.all ?? cond.any;
  if (!list) return { mode: 'all', rows: [{ key: cond.key ?? '', op: cond.op ?? 'eq', value: cond.value }], complex: false };
  if (list.some((c) => c.all || c.any)) return { mode: cond.all ? 'all' : 'any', rows: [], complex: true };
  return { mode: cond.all ? 'all' : 'any', rows: list.map((c) => ({ key: c.key ?? '', op: c.op ?? 'eq', value: c.value })), complex: false };
};
const leaf = (r) => ({ key: r.key, op: r.op, ...(NO_VALUE_OPS.includes(r.op) ? {} : { value: r.value ?? '' }) });
export const rowsToCond = (mode, rows) => (rows.length <= 1 ? (rows[0] ? leaf(rows[0]) : { key: '', op: 'notEmpty' }) : { [mode]: rows.map(leaf) });

// "a, b ,c" <-> ['a','b','c'] for the "is one of" operator.
export const listToText = (v) => (Array.isArray(v) ? v.join(', ') : String(v ?? ''));
export const textToList = (t) => String(t ?? '').split(',').map((x) => x.trim()).filter(Boolean);

// A starting condition for a new `if`: the first field that isn't a group or file.
export const defaultCond = (schema) => {
  const f = formFields(schema).find((x) => !['group', 'file'].includes(x.type));
  return f ? { key: f.key, op: f.type === 'yesno' ? 'eq' : 'notEmpty', ...(f.type === 'yesno' ? { value: true } : {}) } : { key: '', op: 'notEmpty' };
};


// ---- form blocks: section table, checklist table, declaration --------------------------------------------------

export const MAX_CELLS = 6; // the seeded CDD tables use up to 5 columns (2/4/2/2/2)
export const DEFAULT_DECLARATION = 'I declare that the information provided in this form is accurate and truthful. I understand that if I am found to have knowingly made false statements or intentionally omitted any significant details, I may face prosecution and legal penalties under applicable law.';

export const newCell = (over = {}) => ({ label: '', value: '', ...over });
export const newRow = (cells = 2) => ({ cells: Array.from({ length: Math.max(1, Math.min(MAX_CELLS, cells)) }, () => newCell()) });
export const formTableDefault = () => ({ title: 'Section', rows: [newRow(2)] });
export const checklistDefault = () => ({ title: 'Checklist', subtitle: '', rows: [{ text: '', value: '' }, { text: '', value: '' }] });
export const declarationDefault = () => ({ title: 'Declaration', text: DEFAULT_DECLARATION, signatureLabel: 'Signature:', nameLabel: 'Name of Officer/ Shareholder/ Beneficial Owner/ Purchaser/ Customer', dateLabel: 'Date', signer: '' });

// The page frame a template starts with (nothing set).
export const emptyFrame = () => ({ headerLeft: '', headerRight: '', footerLeft: '' });
// What is saved: null when nothing is set (the API clears the frame), else the three strings.
export const frameForSave = (frame) => {
  const f = { ...emptyFrame(), ...(frame ?? {}) };
  for (const k of Object.keys(f)) f[k] = String(f[k] ?? '').trim();
  return Object.values(f).some(Boolean) ? f : null;
};
export const PAGE_STYLES = [{ value: 'letter', label: 'Letter (Arial, wide margins)' }, { value: 'form', label: 'Form (Calibri, narrow margins, grey table headers)' }];

// Values the document itself provides, usable anywhere a field is ({{submission_ref}}). Keep in step
// with backend/lambda (docxRender.js generated_date, docxTemplate.js builtins) and RESERVED_KEYS in
// backend/api model.valueSet.js. `submission`: only filled when a submission is exported.
export const BUILTIN_VALUES = [
  { key: 'submission_ref', label: 'Submission reference', help: 'The last 8 characters of the submission id, in capitals.', example: '01HX7K2Q', submission: true },
  { key: 'submission_title', label: 'Submission title', help: "The submission's title, or the form's name when it has none.", example: 'Acme Pte Ltd onboarding', submission: true },
  { key: 'generated_date', label: 'Date generated', help: 'The date the document is generated.', example: '26 NOV 2026', submission: false },
  { key: 'form_name', label: 'Form name', help: 'The name of the form the submission belongs to.', example: 'CDD: Company', submission: true },
];
export const BUILTIN_KEYS = new Set(BUILTIN_VALUES.map((b) => b.key));
// A reserved key, ignoring case ("GENERATED_DATE" is generated_date): a data source can't define one.
export const isReservedKey = (key) => BUILTIN_KEYS.has(String(key ?? '').trim().toLowerCase());
export const builtinEntries = () => [{ section: 'Document info', items: BUILTIN_VALUES.map((b) => ({ text: b.key, label: b.label, type: 'text', pipe: b.key === 'generated_date' ? 'date' : '' })) }];

// ---- {{tokens}} in the strings of form blocks and the frame

export const tokenText = (text, pipe = '') => `{{${chipText(text, pipe)}}}`;
const TOKEN_RE = /\{\{\s*([^{}]+?)\s*\}\}/g;
// "Born {{dob|date}}, {{full_name}}" -> [{ raw: 'dob|date', base: 'dob', pipe: 'date' }, { raw: 'full_name', base: 'full_name', pipe: '' }]
export const tokensIn = (str) => [...String(str ?? '').matchAll(TOKEN_RE)].map((m) => ({ raw: m[1], ...parseChip(m[1]) }));
// A value that is exactly one token: "{{risk.q1}}" -> 'risk.q1', else null.
export const singleToken = (str) => {
  const m = /^\s*\{\{\s*([^{}|]+?)\s*(?:\|[^{}]*)?\}\}\s*$/.exec(String(str ?? ''));
  return m ? m[1] : null;
};
// Inserts `token` into `str` at `caret` (or `end` of a selection), returns { value, caret } with the caret after it.
export const insertTokenAt = (str, token, caret = null, selectionEnd = null) => {
  const s = String(str ?? '');
  const a = caret == null ? s.length : Math.max(0, Math.min(caret, s.length));
  const b = selectionEnd == null ? a : Math.max(a, Math.min(selectionEnd, s.length));
  return { value: s.slice(0, a) + token + s.slice(b), caret: a + token.length };
};
// Renames the base of every token "{{from|pipe}}" -> "{{to|pipe}}" in a string.
export const renameTokensIn = (str, from, to) =>
  String(str ?? '').replace(TOKEN_RE, (m, raw) => { const { base, pipe } = parseChip(raw); return base === from ? tokenText(to, pipe) : m; });

// Every string of a form block that can hold tokens.
export const tokenStrings = (block) => {
  const it = block?.item ?? {};
  if (block?.type === 'form-table') return (it.rows ?? []).flatMap((r) => (r.cells ?? []).map((c) => c.value));
  if (block?.type === 'form-checklist') return (it.rows ?? []).map((r) => r.value);
  if (block?.type === 'form-declaration') return [it.signer];
  return [];
};
export const frameStrings = (frame) => [frame?.headerLeft, frame?.headerRight, frame?.footerLeft];
// Calls fn(token, block|null) for each token in the form blocks of `list` (and in the frame, with block null).
export const forEachToken = (list, fn, frame = null) => {
  forEachBlock(list, (b) => { if (FORM_BLOCK_TYPES.includes(b.type)) for (const str of tokenStrings(b)) for (const t of tokensIn(str)) fn(t, b); });
  for (const str of frameStrings(frame)) for (const t of tokensIn(str)) fn(t, null);
};

// Section table: row and cell operations. All mutate in place and return the row / cells touched.
export const addRow = (rows, cells = 2, at = rows.length) => { const r = newRow(cells); rows.splice(at, 0, r); return r; };
export const addCell = (row) => { if (row.cells.length >= MAX_CELLS) return null; const c = newCell(); row.cells.push(c); return c; };
export const removeCell = (row, idx) => { if (row.cells.length <= 1) return null; return row.cells.splice(idx, 1)[0]; };
// Gives the row exactly `n` cells (1 to MAX_CELLS), keeping the first ones.
export const setCellCount = (row, n) => {
  const want = Math.max(1, Math.min(MAX_CELLS, n));
  while (row.cells.length > want) row.cells.pop();
  while (row.cells.length < want) row.cells.push(newCell());
  return row;
};
// Width of each cell in twelfths: the cell's own `col`, else an equal share of what is left.
export const cellWidths = (row) => {
  const cells = row.cells ?? [];
  const fixed = cells.reduce((n, c) => n + (c.col || 0), 0);
  const auto = cells.filter((c) => !c.col).length;
  const share = auto ? Math.max(1, Math.floor((12 - Math.min(fixed, 11)) / auto)) : 0;
  return cells.map((c) => c.col || share);
};
// A column-title cell has a value only (no label, no list): turning it on clears those.
export const toggleHead = (cell, on = !cell.head) => {
  cell.head = !!on;
  if (cell.head) { cell.label = ''; cell.list = false; }
  return cell;
};
// A row as saved: only the keys the renderer reads, no empty extras.
export const cleanRow = (row) => ({
  ...(row.repeat ? { repeat: row.repeat } : {}),
  ...(row.stack ? { stack: true } : {}),
  cells: (row.cells ?? []).map((c) => ({
    ...(!c.head && String(c.label ?? '').trim() ? { label: String(c.label).trim() } : {}),
    value: String(c.value ?? ''),
    ...(c.list && !c.head ? { list: true } : {}),
    ...(Number.isInteger(c.col) && c.col >= 1 && c.col <= 12 ? { col: c.col } : {}),
    ...(c.head ? { head: true } : {}),
  })),
});
export const cleanFormTable = (item) => ({ title: String(item?.title ?? '').trim(), rows: (item?.rows ?? []).map(cleanRow) });

// Does the token refer to a multiselect (an array value, shown as a numbered list when `list` is on)?
export const tokenIsArray = (schema, str) => {
  const key = singleToken(str);
  if (!key) return false;
  const [a, b] = key.split('.');
  const f = formFields(schema).find((x) => x.key === a);
  if (!f) return false;
  if (b === undefined) return f.type === 'multiselect';
  return f.type === 'group' && (f.group?.fields ?? []).some((g) => g.key === b && g.type === 'multiselect');
};

// Checklist table: the form's checklist fields, and one row per option of one of them.
export const checklistFields = (schema) => formFields(schema).filter((f) => f.type === 'checklist').map((f) => ({ key: f.key, label: f.label, options: f.options ?? [] }));
export const checklistRows = (schema, fieldKey) => {
  const f = checklistFields(schema).find((x) => x.key === fieldKey);
  return (f?.options ?? []).map((o) => ({ text: String(o.label ?? ''), value: tokenText(`${f.key}.${o.value}`) }));
};
export const cleanChecklist = (item) => ({ title: String(item?.title ?? '').trim(), ...(String(item?.subtitle ?? '').trim() ? { subtitle: String(item.subtitle).trim() } : {}), rows: (item?.rows ?? []).map((r) => ({ text: String(r.text ?? '').trim(), value: String(r.value ?? '').trim() })) });
export const cleanDeclaration = (item) => {
  const out = {};
  for (const k of ['title', 'text', 'signatureLabel', 'nameLabel', 'dateLabel', 'signer']) if (String(item?.[k] ?? '').trim() !== '') out[k] = String(item[k]).trim();
  return out;
};

// Problems a form block has (strings for the dialogs). `schema` (optional) lets it check groups.
export const validateFormBlock = (block, schema = null) => {
  const it = block?.item ?? {};
  const out = [];
  if (block?.type === 'form-table') {
    if (!String(it.title ?? '').trim()) out.push('Give the table a title.');
    if (!it.rows?.length) out.push('Add at least one row.');
    (it.rows ?? []).forEach((r, i) => {
      if (!r.cells?.length || r.cells.length > MAX_CELLS) out.push(`Row ${i + 1}: use 1 to ${MAX_CELLS} cells.`);
      (r.cells ?? []).forEach((c, j) => {
        if (!c.head && !String(c.value ?? '').trim()) out.push(`Row ${i + 1}, cell ${j + 1}: add a value (insert a field).`); // a column title may be empty
        // an unset width (0, empty) means Auto
        if (c.col && !(Number.isInteger(c.col) && c.col >= 1 && c.col <= 12)) out.push(`Row ${i + 1}, cell ${j + 1}: the width must be 1 to 12.`);
      });
      const total = cellWidths(r).reduce((a, b) => a + b, 0);
      if (r.cells?.length && total > 12) out.push(`Row ${i + 1}: the cells are wider than the page (12 in total).`);
      if (r.repeat && schema && !formGroups(schema).some((g) => g.key === r.repeat)) out.push(`Row ${i + 1}: "${r.repeat}" is not a repeating group of the form.`);
    });
  } else if (block?.type === 'form-checklist') {
    if (!String(it.title ?? '').trim()) out.push('Give the checklist a title.');
    if (!it.rows?.length) out.push('Add at least one question.');
    (it.rows ?? []).forEach((r, i) => {
      if (!String(r.text ?? '').trim()) out.push(`Question ${i + 1}: write the question.`);
      if (!singleToken(r.value)) out.push(`Question ${i + 1}: choose the checklist answer it shows.`);
    });
  }
  return out;
};

// ---- saving -------------------------------------------------------------------------------

// What the API accepts: sections are exactly { name, list }.
export const sectionsForSave = (sections) => sections.map((s) => ({ name: String(s.name ?? '').trim() || 'section', list: JSON.parse(JSON.stringify(s.list ?? [])) }));
export const placeholdersForSave = (map) => Object.fromEntries(Object.entries(map ?? {}).filter(([k]) => k).map(([k, v]) => [k, String(v ?? '')]));
// One comparable string of what would be saved (the dirty check).
export const saveSignature = ({ name, section, placeholders, formId, style, frame, valueSetId }) => JSON.stringify([name ?? '', sectionsForSave(section ?? []), placeholdersForSave(placeholders), formId ?? '', style ?? '', frameForSave(frame), valueSetId ?? '']);

export const blankSection = (name = 'section 1') => ({ name, list: [] });
