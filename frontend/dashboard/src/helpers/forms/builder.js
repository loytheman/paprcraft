// Pure helpers for the form builder: field and section factories, keys, conditions (visibleIf),
// moves that respect "a condition may only look at an earlier field". No Vue in here, so it is
// unit-tested (test/forms.builder.test.mjs). The schema shape is documented at the top of
// frontend/design-system/lib/forms.js (a copy of backend/api/src/helpers/formEngine.js).
//
// schema = { sections: [{ id, title, description?, visibleIf?, fields: [Field] }] }
// A location in the builder is { s, f, g? }: section index, field index, and (for a field inside a
// group) the inner field index. { s } alone is a section.
import { nanoid } from 'nanoid';
import { FIELD_TYPES, GROUP_FIELD_TYPES, LIMITS, validateSchema } from '../../../../design-system/lib/forms.js';

export { FIELD_TYPES, GROUP_FIELD_TYPES, LIMITS, validateSchema };

export const uid = () => nanoid(10);
export const KEY_RE = /^[a-z][a-z0-9_]{0,59}$/;

// What the "Add field" menu shows, in this order.
export const TYPE_INFO = [
  { type: 'text', label: 'Short text', hint: 'A name, a number plate, one line' },
  { type: 'longtext', label: 'Long text', hint: 'Remarks, a description' },
  { type: 'number', label: 'Number', hint: 'Amounts, counts' },
  { type: 'date', label: 'Date', hint: 'Date of birth, an expiry date' },
  { type: 'select', label: 'Single choice', hint: 'Pick one from a list' },
  { type: 'multiselect', label: 'Multiple choice', hint: 'Pick several from a list' },
  { type: 'yesno', label: 'Yes / No', hint: 'A single question' },
  { type: 'checklist', label: 'Checklist', hint: 'Several yes / no questions' },
  { type: 'country', label: 'Country', hint: 'Nationality, country of residence' },
  { type: 'email', label: 'Email', hint: 'Checked for a valid address' },
  { type: 'phone', label: 'Phone', hint: 'Checked for a valid number' },
  { type: 'file', label: 'File upload', hint: 'PNG, JPEG, WebP or PDF' },
  { type: 'signature', label: 'Signature', hint: 'Typed name plus a consent tick' },
  { type: 'group', label: 'Repeating group', hint: 'A list of rows, e.g. shareholders' },
];
export const typeLabel = (type) => TYPE_INFO.find((t) => t.type === type)?.label ?? type;
export const HAS_OPTIONS = ['select', 'multiselect', 'checklist'];

// ---- keys -----------------------------------------------------------------------------------------

// "Date of birth" -> "date_of_birth". Always a valid key (letters first, at most 60 characters).
export const slugify = (label) => {
  let s = String(label ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (!s) return 'field';
  if (!/^[a-z]/.test(s)) s = `f_${s}`;
  return s.slice(0, 60).replace(/_+$/, '') || 'field';
};

// base, or base_2, base_3... that is not in `taken` (a Set or array of keys).
export const uniqueKey = (base, taken) => {
  const set = taken instanceof Set ? taken : new Set(taken);
  const root = slugify(base);
  if (!set.has(root)) return root;
  for (let n = 2; n < 1000; n += 1) {
    const suffix = `_${n}`;
    const candidate = `${root.slice(0, 60 - suffix.length)}${suffix}`;
    if (!set.has(candidate)) return candidate;
  }
  return `${root.slice(0, 50)}_${uid().replace(/[^a-z0-9]/gi, '').toLowerCase()}`;
};

// Keys in use at the top level of the form (groups included), or inside one group.
export const topKeys = (schema, except = null) => {
  const out = new Set();
  for (const s of schema.sections) for (const f of s.fields) if (f !== except) out.add(f.key);
  return out;
};
export const groupKeys = (group, except = null) => new Set((group?.fields ?? []).filter((f) => f !== except).map((f) => f.key));

// The keys a field must not collide with: the form's top level, or its group's siblings.
export const scopeKeys = (schema, loc) => {
  if (loc.g !== undefined) return groupKeys(schema.sections[loc.s].fields[loc.f].group, schema.sections[loc.s].fields[loc.f].group.fields[loc.g]);
  return topKeys(schema, schema.sections[loc.s].fields[loc.f]);
};

// The key is "automatic" while it is what the label would produce, so retyping the label keeps it
// in step; once someone edits the key by hand it stays theirs.
export const keyIsAuto = (field, takenWithoutSelf) => field.key === uniqueKey(field.label, takenWithoutSelf);

// Sets a label, and the key with it while the key is automatic. Returns the old key if it changed.
export const relabel = (field, label, takenWithoutSelf) => {
  const auto = keyIsAuto(field, takenWithoutSelf);
  field.label = label;
  if (!auto) return null;
  const old = field.key;
  field.key = uniqueKey(label, takenWithoutSelf);
  return old === field.key ? null : old;
};

export const keyProblem = (key, takenWithoutSelf) => {
  if (!KEY_RE.test(key)) return 'Use lower case letters, digits and _, starting with a letter (up to 60).';
  if (takenWithoutSelf.has(key)) return 'Another field already uses this key.';
  return '';
};

// ---- options ----------------------------------------------------------------------------------------

export const newOption = (options) => {
  const n = options.length + 1;
  const taken = new Set(options.map((o) => o.value));
  return { value: uniqueKey(`option_${n}`, taken), label: `Option ${n}` };
};

// Option value from its label; keeps an existing value when it was typed by hand.
export const optionValueFor = (label, options, self) => uniqueKey(label, new Set(options.filter((o) => o !== self).map((o) => o.value)));

// ---- factories -------------------------------------------------------------------------------------

const DEFAULT_LABEL = {
  text: 'Short text', longtext: 'Long text', number: 'Number', date: 'Date', select: 'Single choice', multiselect: 'Multiple choice', yesno: 'Yes or no question',
  checklist: 'Checklist', country: 'Country', email: 'Email', phone: 'Phone', file: 'File upload', signature: 'Signature', group: 'List',
};

// A new field of `type`, with a key that is free in `takenKeys`. A group starts with one text field.
export const newField = (type, takenKeys, label) => {
  if (!FIELD_TYPES.includes(type)) throw new Error(`Unknown field type: ${type}`);
  const text = label ?? DEFAULT_LABEL[type];
  const f = { id: uid(), key: uniqueKey(text, takenKeys), type, label: text };
  if (HAS_OPTIONS.includes(type)) f.options = type === 'checklist' ? [{ value: 'question_1', label: 'Question 1' }] : [{ value: 'option_1', label: 'Option 1' }, { value: 'option_2', label: 'Option 2' }];
  if (type === 'group') f.group = { min: 0, max: 20, fields: [newField('text', new Set(), 'Name')] };
  if (type === 'signature') f.required = true;
  return f;
};

// Changes a field's type in place, keeping what still applies (label, key, help, required) and
// giving the new type what it needs (options, a group's first field). Inside a group only the
// simple types are allowed. Returns false when the change isn't allowed.
export const changeType = (field, type, { inGroup = false } = {}) => {
  if (!FIELD_TYPES.includes(type) || (inGroup && !GROUP_FIELD_TYPES.includes(type))) return false;
  if (field.type === type) return true;
  const keepOptions = HAS_OPTIONS.includes(field.type) && HAS_OPTIONS.includes(type) ? field.options : undefined;
  delete field.options; delete field.min; delete field.max; delete field.maxLength; delete field.group;
  field.type = type;
  if (HAS_OPTIONS.includes(type)) field.options = keepOptions ?? newField(type, new Set()).options;
  if (type === 'group') field.group = newField('group', new Set()).group;
  if (type === 'signature') field.required = true;
  return true;
};

export const newSection = (schema) => ({ id: uid(), title: `Section ${schema.sections.length + 1}`, fields: [] });
export const blankSchema = () => ({ sections: [{ id: uid(), title: 'Section 1', fields: [] }] });

// A form from the API: ids on everything (older or hand-made schemas may lack some).
export const ensureIds = (schema) => {
  const s = schema?.sections?.length ? schema : blankSchema();
  const used = new Set();
  const fix = (o) => { if (!o.id || used.has(o.id) || !/^[A-Za-z0-9_-]{1,40}$/.test(o.id)) o.id = uid(); used.add(o.id); };
  for (const sec of s.sections) {
    fix(sec);
    sec.fields ??= [];
    for (const f of sec.fields) { fix(f); for (const g of f.group?.fields ?? []) fix(g); }
  }
  return s;
};

const reId = (field) => {
  field.id = uid();
  for (const g of field.group?.fields ?? []) g.id = uid();
  return field;
};

// A copy of a field with new ids and a free key ("full_name" -> "full_name_2").
export const cloneField = (field, takenKeys) => {
  const c = reId(JSON.parse(JSON.stringify(field)));
  c.key = uniqueKey(field.key, takenKeys);
  c.label = `${field.label} (copy)`.slice(0, 300);
  return c;
};

// A copy of a section: new ids, keys made free across the whole form, conditions inside it that
// pointed at its own fields now point at the copies.
export const cloneSection = (schema, index) => {
  const src = schema.sections[index];
  const c = JSON.parse(JSON.stringify(src));
  c.id = uid();
  c.title = `${src.title} (copy)`.slice(0, 150);
  const taken = topKeys(schema);
  const renamed = {};
  for (const f of c.fields) {
    reId(f);
    const old = f.key;
    f.key = uniqueKey(old, taken);
    taken.add(f.key);
    renamed[old] = f.key;
  }
  for (const f of c.fields) f.visibleIf = mapCondKeys(f.visibleIf, renamed);
  delete c.visibleIf; // it pointed at fields before this section; the copy starts unconditional
  return c;
};

// ---- moving -----------------------------------------------------------------------------------------

export const moveItem = (arr, from, to) => {
  if (from === to || from < 0 || to < 0 || from >= arr.length || to >= arr.length) return arr;
  const [item] = arr.splice(from, 1);
  arr.splice(to, 0, item);
  return arr;
};

const orderProblems = (schema) => validateSchema(schema).filter((p) => p.includes('earlier field') || p.includes('internal field'));

// Moves item `from` -> `to` in the list `pick(schema)` returns, unless that leaves a condition
// looking at a field that is no longer earlier. Returns { ok, reason }; the schema is unchanged on refusal.
export const moveChecked = (schema, pick, from, to) => {
  const before = new Set(orderProblems(schema));
  const list = pick(schema);
  if (from === to || to < 0 || to >= list.length) return { ok: false, reason: '' };
  moveItem(list, from, to);
  const worse = orderProblems(schema).find((p) => !before.has(p));
  if (worse) {
    moveItem(pick(schema), to, from); // put it back
    return { ok: false, reason: `Can't move there: ${worse.replace(/^Section \d+( > field \d+)?( \([^)]*\))?: /, '')}` };
  }
  return { ok: true, reason: '' };
};

// ---- conditions -------------------------------------------------------------------------------------

export const OP_LABEL = {
  eq: 'is', neq: 'is not', in: 'is one of', empty: 'is empty', notEmpty: 'is filled in', gt: 'is more than', lt: 'is less than',
};

// Which operators make sense for a field type.
export const opsFor = (type) => {
  switch (type) {
    case 'number': return ['eq', 'neq', 'gt', 'lt', 'empty', 'notEmpty'];
    case 'select': case 'country': return ['eq', 'neq', 'in', 'empty', 'notEmpty'];
    case 'multiselect': return ['eq', 'neq', 'in', 'empty', 'notEmpty']; // "is" = contains
    case 'yesno': return ['eq', 'neq', 'empty', 'notEmpty'];
    case 'checklist': case 'group': case 'file': return ['empty', 'notEmpty'];
    default: return ['eq', 'neq', 'in', 'empty', 'notEmpty'];
  }
};
export const opNeedsValue = (op) => op !== 'empty' && op !== 'notEmpty';

// The first value a new condition on `field` could compare to.
export const defaultValueFor = (field, op) => {
  if (!opNeedsValue(op)) return undefined;
  if (op === 'in') return field.options?.[0] ? [field.options[0].value] : [];
  if (field.type === 'yesno') return true;
  if (field.type === 'number') return 0;
  if (field.options?.length) return field.options[0].value;
  return '';
};

// Fields a condition at this spot may look at: earlier ones, top level, no signatures; never an
// internal field when the thing being conditioned is customer-visible.
export const conditionSources = (schema, loc, { subjectInternal = false } = {}) => {
  const out = [];
  for (let si = 0; si <= loc.s; si += 1) {
    const fields = schema.sections[si].fields;
    // Earlier sections in full; in the section itself, the fields above the field (none, for the section's own condition).
    const end = si < loc.s ? fields.length : loc.f === undefined ? 0 : loc.f;
    for (let fi = 0; fi < end; fi += 1) {
      const f = fields[fi];
      if (f.type === 'signature') continue;
      if (f.internal && !subjectInternal) continue;
      out.push(f);
    }
  }
  return out;
};

// Inside a group, a condition looks at earlier fields of the same row.
export const groupConditionSources = (group, index) => group.fields.slice(0, index).filter((f) => f.type !== 'group' && f.type !== 'file' && f.type !== 'signature');

export const newCondition = (source) => {
  const op = opsFor(source.type)[0];
  return { key: source.key, op, ...(opNeedsValue(op) ? { value: defaultValueFor(source, op) } : {}) };
};

// Coerces a value typed in the editor into what the engine compares against.
export const coerceConditionValue = (source, op, raw) => {
  if (!opNeedsValue(op)) return undefined;
  if (op === 'in') return (Array.isArray(raw) ? raw : String(raw ?? '').split(',')).map((x) => String(x).trim()).filter(Boolean);
  if (source?.type === 'yesno') return raw === true || raw === 'true';
  if (op === 'gt' || op === 'lt' || source?.type === 'number') {
    const n = Number(raw);
    return Number.isFinite(n) ? n : 0;
  }
  return raw ?? '';
};

// A condition tree as { mode, rows, complex }. Only one level of all/any is editable; deeper
// trees are reported as complex and left alone.
export const condToRows = (cond) => {
  if (!cond) return { mode: 'all', rows: [], complex: false };
  const list = cond.all ?? cond.any;
  if (!list) return { mode: 'all', rows: [{ ...cond }], complex: false };
  const mode = cond.all ? 'all' : 'any';
  const complex = list.some((c) => c.all || c.any);
  return { mode, rows: complex ? [] : list.map((c) => ({ ...c })), complex };
};

export const rowsToCond = (mode, rows) => {
  if (!rows.length) return undefined;
  if (rows.length === 1) return { ...rows[0] };
  return { [mode]: rows.map((r) => ({ ...r })) };
};

export const condKeys = (cond, out = []) => {
  if (!cond) return out;
  if (cond.all || cond.any) (cond.all ?? cond.any).forEach((c) => condKeys(c, out));
  else if (cond.key !== undefined) out.push(cond.key);
  return out;
};

// Rewrites the keys a condition mentions ({ old: new }); returns a new condition (or undefined).
export const mapCondKeys = (cond, map) => {
  if (!cond) return cond;
  if (cond.all || cond.any) {
    const k = cond.all ? 'all' : 'any';
    return { [k]: cond[k].map((c) => mapCondKeys(c, map)) };
  }
  return { ...cond, key: map[cond.key] ?? cond.key };
};

// Drops every condition row that mentions `key` (the field was deleted or became a non-source).
export const dropCondKey = (cond, key) => {
  if (!cond) return cond;
  if (cond.all || cond.any) {
    const k = cond.all ? 'all' : 'any';
    const rest = cond[k].map((c) => dropCondKey(c, key)).filter(Boolean);
    if (!rest.length) return undefined;
    return rest.length === 1 ? rest[0] : { [k]: rest };
  }
  return cond.key === key ? undefined : cond;
};

const eachConditioned = (schema, fn) => {
  for (const s of schema.sections) {
    fn(s);
    for (const f of s.fields) fn(f);
  }
};

// A top-level key was renamed: conditions that looked at it follow.
export const renameKeyRefs = (schema, from, to) => {
  eachConditioned(schema, (o) => { if (o.visibleIf) o.visibleIf = mapCondKeys(o.visibleIf, { [from]: to }); });
};

// A top-level field was deleted: conditions that looked at it go. Returns how many things lost one.
export const dropKeyRefs = (schema, key) => {
  let n = 0;
  eachConditioned(schema, (o) => {
    if (!o.visibleIf || !condKeys(o.visibleIf).includes(key)) return;
    const next = dropCondKey(o.visibleIf, key);
    if (next) o.visibleIf = next; else delete o.visibleIf;
    n += 1;
  });
  return n;
};

// Who looks at this key (for the warning before deleting or renaming it).
export const dependents = (schema, key) => {
  const out = [];
  eachConditioned(schema, (o) => { if (o.visibleIf && condKeys(o.visibleIf).includes(key)) out.push(o.label ?? o.title); });
  return out;
};

// ---- describing -------------------------------------------------------------------------------------

export const describeCondition = (cond, schema) => {
  if (!cond) return '';
  const label = (k) => allTopFields(schema).find((f) => f.key === k)?.label ?? k;
  const one = (c) => {
    const f = allTopFields(schema).find((x) => x.key === c.key);
    const optLabel = (v) => f?.options?.find((o) => o.value === v)?.label ?? String(v);
    const val = !opNeedsValue(c.op) ? '' : Array.isArray(c.value) ? c.value.map(optLabel).join(', ') : typeof c.value === 'boolean' ? (c.value ? 'Yes' : 'No') : optLabel(c.value);
    return `${label(c.key)} ${OP_LABEL[c.op] ?? c.op}${val ? ` ${val}` : ''}`;
  };
  if (cond.all || cond.any) return (cond.all ?? cond.any).map(one).join(cond.all ? ' and ' : ' or ');
  return one(cond);
};

export const allTopFields = (schema) => schema.sections.flatMap((s) => s.fields);
export const countFields = (schema) => allTopFields(schema).length;

// What changes the "unsaved" flag: everything the form sends on save.
export const formSignature = (f) => JSON.stringify({ name: f.name ?? '', description: f.description ?? '', schema: f.schema, settings: f.settings ?? {}, templateId: f.templateId ?? '' });

// Fields that, once the form has been published, change what existing documents and exports mean.
export const keyChanges = (published, current) => {
  const keys = (s) => new Set(allTopFields(s).map((f) => f.key));
  const was = keys(published);
  const now = keys(current);
  return { removed: [...was].filter((k) => !now.has(k)), added: [...now].filter((k) => !was.has(k)) };
};
