import httpStatus from "http-status";
import valueSetModel, { MAX_VALUE_SETS, RESERVED_KEYS } from "../models/model.valueSet.js";
import { ApiError, errorType, errorMessage } from "../middlewares/error.js";

// An account's value sets (model.valueSet.js). Exports fill a template's {{KEY}} chips from the
// set they name (service.template.js, service.submission.js).

const badRequest = (msg) => new ApiError(httpStatus.BAD_REQUEST, errorType.BAD_REQUEST, msg);
const notFound = () => new ApiError(httpStatus.NOT_FOUND, errorType.NOT_FOUND, errorMessage.NOT_FOUND);

// The set, or 404 when it is missing or another account's.
export const getValueSetFor = async (id, accountId) => {
  const s = await valueSetModel.getById(id);
  if (!s || s.accountId !== accountId) throw notFound();
  return s;
};

const isReserved = (key) => RESERVED_KEYS.includes(String(key).trim().toLowerCase());

// A set may not define a reserved placeholder ({{generated_date}}...): the document fills those itself.
const assertNoReserved = (values) => {
  const hit = Object.keys(values ?? {}).filter(isReserved);
  if (hit.length) throw badRequest(`${hit.join(", ")} ${hit.length === 1 ? "is" : "are"} reserved: the document fills ${hit.length === 1 ? "it" : "them"} in itself. Use another key.`);
};

// The values an export should use: the set's, then the request's own (which win). A set that has
// been deleted since it was picked is refused, so the document never quietly comes out blank. A
// reserved key a set holds from before the check is left out, so it can't replace the real value.
export const exportValues = async (valueSetId, accountId, values = {}) => {
  if (!valueSetId) return values ?? {};
  const s = await valueSetModel.getById(valueSetId);
  if (!s || s.accountId !== accountId) throw badRequest("The selected data source no longer exists. Pick another one.");
  const own = Object.fromEntries(Object.entries(s.values ?? {}).filter(([k]) => !isReserved(k)));
  return { ...own, ...(values ?? {}) };
};

// Names are unique per account, ignoring case, so the pickers never show two "Acme" sets.
const assertNameFree = (sets, name, exceptId = null) => {
  if (sets.some((s) => s.id !== exceptId && s.name.toLowerCase() === name.toLowerCase())) throw badRequest(`You already have a data source called "${name}".`);
};

// Alphabetical, so the pickers read the same everywhere.
export const listValueSets = async (accountId) => {
  const sets = await valueSetModel.getAllForAccount(accountId);
  return sets.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
};

export const createValueSet = async ({ name, values }, accountId, blameable) => {
  const sets = await valueSetModel.getAllForAccount(accountId);
  if (sets.length >= MAX_VALUE_SETS) throw badRequest(`An account keeps up to ${MAX_VALUE_SETS} data sources. Delete one first.`);
  assertNameFree(sets, name);
  assertNoReserved(values);
  const created = await valueSetModel.create({ accountId, name, values: values ?? {} }, blameable);
  return created;
};

export const updateValueSet = async ({ id, name, values }, accountId, blameable) => {
  await getValueSetFor(id, accountId);
  assertNoReserved(values);
  if (name !== undefined) {
    const sets = await valueSetModel.getAllForAccount(accountId);
    assertNameFree(sets, name, id);
  }
  const data = { id };
  if (name !== undefined) data.name = name;
  if (values !== undefined) data.values = values;
  await valueSetModel.update(data, blameable);
  const updated = await valueSetModel.getById(id);
  return updated;
};

// Templates that picked this set keep its id; their next export asks for another set (exportValues).
export const deleteValueSet = async (id, accountId, blameable) => {
  await getValueSetFor(id, accountId);
  await valueSetModel.remove(id, blameable);
};
