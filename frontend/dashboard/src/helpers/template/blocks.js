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
// Placeholders are Quill embeds: a delta op { insert: { text: KEY, value }, attributes: { placeholder: true } }.
import { nanoid } from 'nanoid';

export const uid = () => nanoid();

export const TEXT_TYPES = ['paragraph', 'list-item-paragraph'];
export const TABLE_TYPES = ['table-01', 'table-02', 'table-03', 'table-04']; // table-04 is only rendered if it exists (older templates); the editor offers 01-03
export const SIGN_TYPES = ['sign-area-01', 'sign-area-02', 'sign-area-03', 'sign-area-04'];
// Blocks that only make sense at the top level of a section.
export const ROOT_ONLY_TYPES = ['layout-corpsec-header-01', 'layout-company-header-01', 'layout-company-act', 'layout-form-45b', 'sign-area-01', 'sign-area-02', 'sign-area-03', 'sign-area-04', 'page-break', 'page-break-02'];

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

// Deep copy with fresh ids (a cloned block must not share an id, ids name the editors).
export const cloneBlock = (block) => {
  const copy = JSON.parse(JSON.stringify(block));
  const fresh = (b) => {
    b.id = uid();
    if (b.type === 'list' && Array.isArray(b.item)) b.item.forEach(fresh);
  };
  fresh(copy);
  return copy;
};

// Every block carries an id (the DB rows from older editors may not).
export const ensureIds = (list) => {
  for (const b of list ?? []) {
    if (!b.id) b.id = uid();
    if (b.type === 'list' && Array.isArray(b.item)) ensureIds(b.item);
  }
  return list;
};

// Index path to the block with this id: [2] at the top, [2, 0] inside the list at index 2. null if absent.
export const findPath = (list, id, prefix = []) => {
  for (let i = 0; i < (list?.length ?? 0); i++) {
    const b = list[i];
    if (b.id === id) return [...prefix, i];
    if (b.type === 'list' && Array.isArray(b.item)) {
      const inner = findPath(b.item, id, [...prefix, i]);
      if (inner) return inner;
    }
  }
  return null;
};

const arrayAt = (list, path) => path.slice(0, -1).reduce((arr, i) => arr[i].item, list);

// Inserts `block` below the focused block (or at the end). Text and list blocks go next to the
// focus, even inside a list; layout blocks (headers, signatures, page breaks) go below the
// top-level block that holds the focus, never inside a list.
export const insertAfterFocus = (list, focusId, block) => {
  const path = focusId ? findPath(list, focusId) : null;
  if (!path) {
    list.push(block);
    return;
  }
  if (ROOT_ONLY_TYPES.includes(block.type) || TABLE_TYPES.includes(block.type)) {
    list.splice(path[0] + 1, 0, block);
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

// Calls fn(block) for every block, lists included (depth first).
export const forEachBlock = (list, fn) => {
  for (const b of list ?? []) {
    fn(b);
    if (b.type === 'list' && Array.isArray(b.item)) forEachBlock(b.item, fn);
  }
};

// Calls fn(cell, ownerBlock) for every editable text cell: paragraph / list items / table cells.
export const forEachCell = (list, fn) => {
  for (const b of list ?? []) {
    if (b.type === 'list' && Array.isArray(b.item)) forEachCell(b.item, fn);
    else if (TEXT_TYPES.includes(b.type)) fn(b.item, b);
    else if (TABLE_TYPES.includes(b.type)) for (const row of b.item?.data ?? []) for (const k of Object.keys(row)) fn(row[k], b);
  }
};

const placeholderOps = (cell) => (cell?.delta?.ops ?? []).filter((op) => op?.attributes?.placeholder && op.insert && typeof op.insert === 'object');

// A chip is "replaced" when it has a value of its own or its key has one in `values`.
export const countPlaceholders = (list, values = {}) => {
  let total = 0;
  let replaced = 0;
  forEachCell(list, (cell) => {
    for (const op of placeholderOps(cell)) {
      total++;
      if (op.insert.value || values[op.insert.text]) replaced++;
    }
  });
  return { total, replaced };
};

// How many times each key is used across the given sections: { KEY: n }.
export const placeholderUsage = (sections) => {
  const out = {};
  for (const s of sections ?? []) forEachCell(s.list, (cell) => { for (const op of placeholderOps(cell)) out[op.insert.text] = (out[op.insert.text] ?? 0) + 1; });
  return out;
};

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const escapeAttr = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;');

// Renames a placeholder key in every chip (delta and html). Returns how many chips changed.
export const renamePlaceholderKey = (sections, from, to) => {
  let n = 0;
  const attrFrom = new RegExp(`data-text="${escapeRe(escapeAttr(from))}"`, 'g');
  const shownFrom = new RegExp(`\\{\\{${escapeRe(from.toUpperCase())}\\}\\}`, 'g');
  for (const s of sections ?? []) {
    forEachCell(s.list, (cell) => {
      for (const op of placeholderOps(cell)) {
        if (op.insert.text === from) { op.insert.text = to; n++; }
      }
      if (typeof cell.text === 'string' && cell.text.includes(from)) {
        cell.text = cell.text.replace(attrFrom, `data-text="${escapeAttr(to)}"`).replace(shownFrom, `{{${to.toUpperCase()}}}`);
      }
    });
  }
  return n;
};

// ---- saving -------------------------------------------------------------------------------

// What the API accepts: sections are exactly { name, list }.
export const sectionsForSave = (sections) => sections.map((s) => ({ name: String(s.name ?? '').trim() || 'section', list: JSON.parse(JSON.stringify(s.list ?? [])) }));
export const placeholdersForSave = (map) => Object.fromEntries(Object.entries(map ?? {}).filter(([k]) => k).map(([k, v]) => [k, String(v ?? '')]));
// One comparable string of what would be saved (the dirty check).
export const saveSignature = ({ name, section, placeholders }) => JSON.stringify([name ?? '', sectionsForSave(section ?? []), placeholdersForSave(placeholders)]);

export const blankSection = (name = 'section 1') => ({ name, list: [] });
