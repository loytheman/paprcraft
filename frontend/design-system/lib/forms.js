// Dynamic forms: the rules shared by the API (service.form.js, service.submission.js), the docx
// Lambda (backend/lambda/formEngine.js, a CommonJS copy) and the dashboard / public form app
// (frontend/design-system/lib/forms.js, a copy). Pure functions, no dependencies. When you change
// this file, change the copies too: backend/api/test/formEngine.vectors.json is run against all of them.
//
// Form schema:
//   { sections: [{ id, title, description?, visibleIf?, fields: [Field] }] }
//   Field = { id, key, type, label, help?, required?, internal?, sensitive?, options?: [{value,label}],
//             min?, max?, maxLength?, visibleIf?, group?: { fields: [Field], min?, max? } }
//   visibleIf = { key, op, value? } | { all: [visibleIf] } | { any: [visibleIf] }
//   ops: eq neq in empty notEmpty gt lt
// Values: { [key]: value }. A group's value is an array of rows ({ [key]: value }); a checklist's is
// { [optionValue]: true|false }; a signature's is { name, consent }; a file field's value is the list
// of attachment ids, set by the server (never accepted from a client).

export const FIELD_TYPES = ["text", "longtext", "number", "date", "select", "multiselect", "yesno", "checklist", "country", "email", "phone", "file", "signature", "group"];
export const GROUP_FIELD_TYPES = FIELD_TYPES.filter((t) => !["group", "file", "signature"].includes(t));
export const OPS = ["eq", "neq", "in", "empty", "notEmpty", "gt", "lt"];

export const LIMITS = { sections: 30, fields: 300, options: 100, groupFields: 30, groupRows: 200, text: 500, longtext: 10000, schemaBytes: 300000 };
const KEY_RE = /^[a-z][a-z0-9_]{0,59}$/;
const OPTION_RE = /^[A-Za-z0-9_.-]{1,60}$/;
const ID_RE = /^[A-Za-z0-9_-]{1,40}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[+0-9 ()-]{5,25}$/;

const isObj = (v) => v && typeof v === "object" && !Array.isArray(v);
export const isEmpty = (v) => v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0);

// ---- conditions -----------------------------------------------------------------------------------

const same = (a, b) => (Array.isArray(a) ? a.some((x) => String(x) === String(b)) : a === b || (a != null && b != null && typeof a !== "object" && String(a) === String(b)));

export const evalCond = (cond, values) => {
  if (!cond) return true;
  if (Array.isArray(cond.all)) return cond.all.every((c) => evalCond(c, values));
  if (Array.isArray(cond.any)) return cond.any.some((c) => evalCond(c, values));
  const a = values?.[cond.key];
  switch (cond.op) {
    case "eq": return same(a, cond.value);
    case "neq": return !same(a, cond.value);
    case "in": return Array.isArray(cond.value) && cond.value.some((v) => same(a, v));
    case "empty": return isEmpty(a);
    case "notEmpty": return !isEmpty(a);
    case "gt": return Number(a) > Number(cond.value);
    case "lt": return Number(a) < Number(cond.value);
    default: return false;
  }
};

const condKeys = (cond, out = []) => {
  if (!cond) return out;
  if (Array.isArray(cond.all)) cond.all.forEach((c) => condKeys(c, out));
  else if (Array.isArray(cond.any)) cond.any.forEach((c) => condKeys(c, out));
  else if (cond.key !== undefined) out.push(cond.key);
  return out;
};

const condErrors = (cond, where, known, errors) => {
  if (cond === undefined || cond === null) return;
  if (!isObj(cond)) return errors.push(`${where}: visibleIf must be an object.`);
  if (cond.all || cond.any) {
    const list = cond.all ?? cond.any;
    if (!Array.isArray(list) || !list.length || list.length > 20) return errors.push(`${where}: visibleIf all/any needs 1 to 20 conditions.`);
    return list.forEach((c) => condErrors(c, where, known, errors));
  }
  if (!OPS.includes(cond.op)) return errors.push(`${where}: unknown visibleIf operator "${cond.op}".`);
  if (!known.has(cond.key)) errors.push(`${where}: visibleIf refers to "${cond.key}", which must be an earlier field.`);
  if (cond.op === "in" && !Array.isArray(cond.value)) errors.push(`${where}: visibleIf "in" needs a list of values.`);
};

// ---- schema validation (when a form is saved) ---------------------------------------------------

const fieldErrors = (f, where, scope, errors, { inGroup = false } = {}) => {
  if (!isObj(f)) return errors.push(`${where}: not a field.`);
  if (!ID_RE.test(f.id ?? "")) errors.push(`${where}: field needs an id (letters, digits, - or _).`);
  if (!KEY_RE.test(f.key ?? "")) errors.push(`${where}: key "${f.key ?? ""}" must be lower case letters, digits and _, starting with a letter.`);
  else if (scope.keys.has(f.key)) errors.push(`${where}: key "${f.key}" is used twice.`);
  if (!FIELD_TYPES.includes(f.type)) return errors.push(`${where}: unknown field type "${f.type}".`);
  if (inGroup && !GROUP_FIELD_TYPES.includes(f.type)) errors.push(`${where}: a group can't contain a ${f.type} field.`);
  if (typeof f.label !== "string" || !f.label.trim() || f.label.length > 300) errors.push(`${where}: label is required (up to 300 characters).`);
  if (["select", "multiselect", "checklist"].includes(f.type)) {
    const o = f.options;
    if (!Array.isArray(o) || !o.length || o.length > LIMITS.options) errors.push(`${where}: needs 1 to ${LIMITS.options} options.`);
    else {
      const seen = new Set();
      for (const x of o) {
        if (!isObj(x) || !OPTION_RE.test(x.value ?? "") || typeof x.label !== "string" || !x.label.trim()) errors.push(`${where}: each option needs a value (letters, digits, _ . -) and a label.`);
        else if (seen.has(x.value)) errors.push(`${where}: option "${x.value}" is used twice.`);
        else seen.add(x.value);
      }
    }
  }
  if (f.type === "number") {
    for (const k of ["min", "max"]) if (f[k] !== undefined && !Number.isFinite(f[k])) errors.push(`${where}: ${k} must be a number.`);
  }
  if (f.type === "group") {
    const g = f.group;
    if (!isObj(g) || !Array.isArray(g.fields) || !g.fields.length || g.fields.length > LIMITS.groupFields) errors.push(`${where}: a group needs 1 to ${LIMITS.groupFields} fields.`);
    else {
      for (const k of ["min", "max"]) if (g[k] !== undefined && (!Number.isInteger(g[k]) || g[k] < 0 || g[k] > LIMITS.groupRows)) errors.push(`${where}: group ${k} must be a whole number up to ${LIMITS.groupRows}.`);
      if (Number.isInteger(g.min) && Number.isInteger(g.max) && g.min > g.max) errors.push(`${where}: group min is more than max.`);
      const inner = { keys: new Set(), internal: new Set() };
      g.fields.forEach((gf, i) => {
        const w = `${where} > field ${i + 1}`;
        condErrors(gf?.visibleIf, w, inner.keys, errors);
        fieldErrors(gf, w, inner, errors, { inGroup: true });
        if (KEY_RE.test(gf?.key ?? "")) inner.keys.add(gf.key);
      });
    }
  }
};

// -> list of problems (empty = valid).
export const validateSchema = (schema) => {
  const errors = [];
  if (!isObj(schema) || !Array.isArray(schema.sections)) return ["The form needs a list of sections."];
  if (!schema.sections.length || schema.sections.length > LIMITS.sections) return [`A form needs 1 to ${LIMITS.sections} sections.`];
  if (JSON.stringify(schema).length > LIMITS.schemaBytes) return ["The form is too large."];
  const scope = { keys: new Set() };
  const internalKeys = new Set();
  const sectionIds = new Set();
  let total = 0;
  schema.sections.forEach((s, si) => {
    const sw = `Section ${si + 1}`;
    if (!isObj(s)) return errors.push(`${sw}: not a section.`);
    if (!ID_RE.test(s.id ?? "") || sectionIds.has(s.id)) errors.push(`${sw}: needs a unique id.`);
    sectionIds.add(s.id);
    if (typeof s.title !== "string" || !s.title.trim() || s.title.length > 150) errors.push(`${sw}: title is required (up to 150 characters).`);
    if (!Array.isArray(s.fields)) return errors.push(`${sw}: needs a list of fields.`);
    condErrors(s.visibleIf, sw, scope.keys, errors);
    for (const k of condKeys(s.visibleIf)) if (internalKeys.has(k) && !s.internal) { /* internal sections are checked below */ }
    s.fields.forEach((f, fi) => {
      total += 1;
      const w = `${sw} > field ${fi + 1}${f?.label ? ` (${f.label})` : ""}`;
      condErrors(f?.visibleIf, w, scope.keys, errors);
      // A field a customer can see must not depend on an internal one (it would leak the answer).
      if (!f?.internal) for (const k of condKeys(f?.visibleIf)) if (internalKeys.has(k)) errors.push(`${w}: can't depend on the internal field "${k}".`);
      fieldErrors(f, w, scope, errors);
      if (KEY_RE.test(f?.key ?? "")) { scope.keys.add(f.key); if (f.internal) internalKeys.add(f.key); }
    });
  });
  if (total > LIMITS.fields) errors.push(`A form can have up to ${LIMITS.fields} fields.`);
  return errors;
};

// ---- values ---------------------------------------------------------------------------------------

export const allFields = (schema) => (schema?.sections ?? []).flatMap((s) => (s.fields ?? []).map((f) => ({ ...f, _section: s })));

// { error } or { value } (value undefined = nothing to store).
const coerce = (f, raw) => {
  if (raw === undefined || raw === null || raw === "") return { value: undefined };
  switch (f.type) {
    case "text": case "longtext": {
      if (typeof raw !== "string" && typeof raw !== "number") return { error: "Enter text." };
      const s = String(raw).trim();
      const max = Math.min(f.maxLength || Infinity, LIMITS[f.type]);
      return s.length > max ? { error: `Up to ${max} characters.` } : { value: s || undefined };
    }
    case "email": {
      const s = String(raw).trim();
      return s.length <= 254 && EMAIL_RE.test(s) ? { value: s } : { error: "Enter a valid email address." };
    }
    case "phone": {
      const s = String(raw).trim();
      return PHONE_RE.test(s) ? { value: s } : { error: "Enter a valid phone number." };
    }
    case "country": {
      const s = String(raw).trim().toUpperCase();
      return /^[A-Z]{2}$/.test(s) ? { value: s } : { error: "Choose a country." };
    }
    case "number": {
      const n = typeof raw === "number" ? raw : Number(String(raw).trim());
      if (!Number.isFinite(n)) return { error: "Enter a number." };
      if (f.min !== undefined && n < f.min) return { error: `At least ${f.min}.` };
      if (f.max !== undefined && n > f.max) return { error: `At most ${f.max}.` };
      return { value: n };
    }
    case "date": {
      const s = String(raw).trim();
      const d = new Date(`${s}T00:00:00Z`);
      return DATE_RE.test(s) && !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s ? { value: s } : { error: "Enter a valid date." };
    }
    case "select": {
      const s = String(raw);
      return (f.options ?? []).some((o) => o.value === s) ? { value: s } : { error: "Choose one of the options." };
    }
    case "multiselect": {
      if (!Array.isArray(raw)) return { error: "Choose from the options." };
      const vals = [...new Set(raw.map(String))];
      if (vals.some((v) => !(f.options ?? []).some((o) => o.value === v))) return { error: "Choose from the options." };
      return { value: vals.length ? vals : undefined };
    }
    case "yesno": {
      if (typeof raw === "boolean") return { value: raw };
      if (raw === "true" || raw === "yes") return { value: true };
      if (raw === "false" || raw === "no") return { value: false };
      return { error: "Answer yes or no." };
    }
    case "checklist": {
      if (!isObj(raw)) return { error: "Answer each question." };
      const out = {};
      for (const o of f.options ?? []) if (typeof raw[o.value] === "boolean") out[o.value] = raw[o.value];
      return { value: Object.keys(out).length ? out : undefined };
    }
    case "signature": {
      if (!isObj(raw)) return { error: "Type your name to sign." };
      const name = typeof raw.name === "string" ? raw.name.trim().slice(0, 150) : "";
      return name || raw.consent === true ? { value: { name, consent: raw.consent === true } } : { value: undefined };
    }
    default:
      return { error: "Unsupported field." };
  }
};

const missing = (f, v) => {
  if (f.type === "yesno") return v === undefined;
  if (f.type === "checklist") return !isObj(v) || (f.options ?? []).some((o) => typeof v[o.value] !== "boolean");
  if (f.type === "signature") return !isObj(v) || !v.name || v.consent !== true;
  return isEmpty(v);
};

// One flat list of fields (a section / group scope) -> { values, errors }.
const normalizeScope = (fields, input, ctx, path) => {
  const coerced = {};
  const errs = {};
  for (const f of fields) {
    if (f.type === "file") { if (ctx.fileValues?.[f.key]?.length) coerced[f.key] = ctx.fileValues[f.key]; continue; }
    if (f.internal && ctx.audience === "public") { if (ctx.existing?.[f.key] !== undefined) coerced[f.key] = ctx.existing[f.key]; continue; } // customers can't touch internal fields
    if (f.type === "group") {
      const raw = input?.[f.key];
      if (raw === undefined || raw === null) continue;
      if (!Array.isArray(raw)) { errs[f.key] = "Add rows to this list."; continue; }
      const max = Math.min(f.group?.max ?? LIMITS.groupRows, LIMITS.groupRows);
      if (raw.length > max) { errs[f.key] = `Up to ${max} rows.`; continue; }
      const rows = [];
      const rowErrors = [];
      raw.forEach((row, i) => {
        const r = normalizeScope(f.group.fields, isObj(row) ? row : {}, { ...ctx, existing: {}, fileValues: {} }, [...path, f.key, i]);
        rows.push(r.values); // an empty row stays, so the row numbers in errors match what was sent
        rowErrors.push(...r.errors.map((e) => ({ ...e, key: f.key, row: i, field: e.key })));
      });
      coerced[f.key] = rows;
      errs[f.key] = rowErrors;
      continue;
    }
    const r = coerce(f, input?.[f.key]);
    if (r.error) errs[f.key] = r.error;
    else if (r.value !== undefined) coerced[f.key] = r.value;
  }
  // Visibility is judged on what was answered; hidden fields lose their value and their errors.
  const values = {};
  const errors = [];
  for (const f of fields) {
    const shown = evalCond(f.visibleIf, coerced) && (f._section ? evalCond(f._section.visibleIf, coerced) : true);
    if (!shown) continue;
    if (f.internal && ctx.audience === "public") { if (coerced[f.key] !== undefined) values[f.key] = coerced[f.key]; continue; }
    const v = coerced[f.key];
    if (errs[f.key]) {
      if (Array.isArray(errs[f.key])) errors.push(...errs[f.key]);
      else errors.push({ key: f.key, message: errs[f.key] });
    }
    if (v !== undefined && !(f.type === "group" && !v.length)) values[f.key] = v;
    if (ctx.mode === "submit" && !errs[f.key]) {
      const min = f.type === "group" ? Math.max(f.group?.min ?? (f.required ? 1 : 0), 0) : 0;
      if (f.type === "group" ? (v?.length ?? 0) < min : f.required && missing(f, v)) {
        errors.push({ key: f.key, message: f.type === "group" ? `Add at least ${min || 1} row${min > 1 ? "s" : ""}.` : f.type === "signature" ? "Type your name and tick the box to sign." : "This is required." });
      }
    }
  }
  return { values, errors };
};

// Checks and cleans a submission's values against its schema.
//   mode: "draft" (types only) | "submit" (also required fields, group min)
//   audience: "account" | "public" (internal fields can't be written or required)
//   existing: current values (kept for internal fields a customer can't see)
//   fileValues: { fileFieldKey: [attachmentId] } from the server
// -> { values, errors: [{ key, message, row?, field? }] }
export const normalizeValues = (schema, input, { mode = "draft", audience = "account", existing = {}, fileValues = {} } = {}) => {
  const fields = allFields(schema);
  return normalizeScope(fields, isObj(input) ? input : {}, { mode, audience, existing, fileValues }, []);
};

// The schema a customer sees: no internal fields, and no sections left empty by that.
export const publicSchema = (schema) => ({
  sections: (schema?.sections ?? [])
    .map((s) => ({ ...s, fields: (s.fields ?? []).filter((f) => !f.internal) }))
    .filter((s) => s.fields.length),
});
export const publicValues = (schema, values) => {
  const hidden = new Set(allFields(schema).filter((f) => f.internal).map((f) => f.key));
  return Object.fromEntries(Object.entries(values ?? {}).filter(([k]) => !hidden.has(k)));
};

// ---- output data for document templates ------------------------------------------------------------

const labelOf = (f, v) => (f.options ?? []).find((o) => o.value === v)?.label ?? v;
const flatValue = (f, v) => {
  if (v === undefined || v === null) return v;
  if (f.type === "select") return labelOf(f, v);
  if (f.type === "multiselect") return v.map((x) => labelOf(f, x));
  if (f.type === "checklist") return v;
  if (f.type === "signature") return v?.name ?? "";
  if (f.type === "group") return v.map((row) => Object.fromEntries((f.group?.fields ?? []).filter((gf) => row[gf.key] !== undefined).map((gf) => [gf.key, flatValue(gf, row[gf.key])])));
  return v;
};

// -> { data, raw, keys }: data has select values as their labels (for the document); raw is values as stored;
// keys lists every field key of the form, so a document can tell an unanswered field from a typo.
export const flatten = (schema, values) => {
  const data = {};
  for (const f of allFields(schema)) {
    if (f.type === "file") continue;
    const v = values?.[f.key];
    if (v !== undefined) data[f.key] = flatValue(f, v);
  }
  return { data, raw: values ?? {}, keys: allFields(schema).map((f) => f.key) };
};
