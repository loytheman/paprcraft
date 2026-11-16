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
export const ROOT_ONLY_TYPES = ['layout-corpsec-header-01', 'layout-company-header-01', 'layout-company-act', 'layout-form-45b', 'sign-area-01', 'sign-area-02', 'sign-area-03', 'sign-area-04', 'page-break', 'page-break-02'];

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
      if (op.insert.value || values[op.insert.text] || values[base] || formKeys?.has(base)) replaced++;
    }
  });
  return { total, replaced };
};

// How many times each key is used across the given sections: { key: n }. A formatter ("dob|date")
// counts for its key ("dob").
export const placeholderUsage = (sections) => {
  const out = {};
  for (const s of sections ?? []) forEachCell(s.list, (cell) => { for (const op of placeholderOps(cell)) { const { base } = parseChip(op.insert.text); out[base] = (out[base] ?? 0) + 1; } });
  return out;
};

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const escapeAttr = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;');

// Renames a placeholder key in every chip (delta and html), keeping each chip's formatter
// ("dob|date" -> "born|date"). Returns how many chips changed.
export const renamePlaceholderKey = (sections, from, to) => {
  let n = 0;
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

// ---- saving -------------------------------------------------------------------------------

// What the API accepts: sections are exactly { name, list }.
export const sectionsForSave = (sections) => sections.map((s) => ({ name: String(s.name ?? '').trim() || 'section', list: JSON.parse(JSON.stringify(s.list ?? [])) }));
export const placeholdersForSave = (map) => Object.fromEntries(Object.entries(map ?? {}).filter(([k]) => k).map(([k, v]) => [k, String(v ?? '')]));
// One comparable string of what would be saved (the dirty check).
export const saveSignature = ({ name, section, placeholders, formId }) => JSON.stringify([name ?? '', sectionsForSave(section ?? []), placeholdersForSave(placeholders), formId ?? '']);

export const blankSection = (name = 'section 1') => ({ name, list: [] });
