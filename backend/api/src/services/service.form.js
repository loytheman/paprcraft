// Dynamic forms (model.form.js, helpers/formEngine.js). Two owners share this code:
//   - an account's own forms: counted against formLimit
//   - the staff-managed masters (MASTER_ACCOUNT_ID; /staff/master-forms and read-only /form-masters):
//     an account clones one, and its output template comes along (service.template.js)
// A form is edited as a draft; "publish" validates it and bumps `version`. Submissions can only be
// started from a published form, and each keeps a snapshot of the schema it started from.
import httpStatus from "http-status";
import { ApiError, errorType, errorMessage } from "../middlewares/error.js";
import formModel, { formStatus } from "../models/model.form.js";
import submissionModel from "../models/model.submission.js";
import { MASTER_ACCOUNT_ID } from "../models/model.template.js";
import { getAccountPlan, planLimitError, isTopPlan, includesText, assertNotSuspended } from "./service.plan.js";
import { cloneTemplate, updateTemplate } from "./service.template.js";
import { validateSchema } from "../helpers/formEngine.js";

const notFound = () => new ApiError(httpStatus.NOT_FOUND, errorType.NOT_FOUND, errorMessage.NOT_FOUND);
const badRequest = (msg) => new ApiError(httpStatus.BAD_REQUEST, errorType.BAD_REQUEST, msg);

export const blankSchema = () => ({ sections: [{ id: "s1", title: "Section 1", fields: [] }] });
const DEFAULT_SETTINGS = { publicEnabled: false, requireApprovedToExport: false };

const assertValidSchema = (schema) => {
  const problems = validateSchema(schema);
  if (problems.length) {
    const err = badRequest(problems[0]);
    err.data = { problems };
    throw err;
  }
};

export const getFormFor = async (id, ownerId) => {
  const f = await formModel.getById(id);
  if (!f || f.accountId !== ownerId) throw notFound();
  return f;
};

export const listForms = (ownerId) => formModel.getAllForAccount(ownerId);
export const getForm = (id, ownerId) => getFormFor(id, ownerId);

const assertUnderLimit = async (accountId) => {
  const [plan, own] = await Promise.all([getAccountPlan(accountId), formModel.getAllForAccount(accountId)]);
  assertNotSuspended(plan);
  if (own.length >= plan.formLimit) {
    throw planLimitError(`${includesText(plan, "formLimit")} ${plan.formLimit} forms. ${isTopPlan(plan) ? "Delete one first." : "Upgrade for more, or delete one first."}`);
  }
};

export const createForm = async ({ name, description, schema, settings }, ownerId, blameable) => {
  if (ownerId !== MASTER_ACCOUNT_ID) await assertUnderLimit(ownerId);
  const s = schema ?? blankSchema();
  assertValidSchema(s);
  return formModel.create({ accountId: ownerId, name, description, schema: s, settings: { ...DEFAULT_SETTINGS, ...settings }, keywordSearch: name.toLowerCase(), status: formStatus.DRAFT, version: 0 }, blameable);
};

export const updateForm = async ({ id, ...fields }, ownerId, blameable) => {
  const current = await getFormFor(id, ownerId);
  if (fields.schema) assertValidSchema(fields.schema);
  const data = { id, ...fields, ...(fields.name && { keywordSearch: fields.name.toLowerCase() }) };
  if (fields.templateId === "" || fields.templateId === null) data.templateId = null;
  if (fields.settings) data.settings = { ...DEFAULT_SETTINGS, ...fields.settings };
  await formModel.update(data, blameable);
  return getFormFor(id, ownerId).catch(() => current);
};

// Draft -> published. Validates, and bumps the version.
export const publishForm = async (id, ownerId, blameable) => {
  const f = await getFormFor(id, ownerId);
  assertValidSchema(f.schema);
  const fieldCount = (f.schema.sections ?? []).reduce((n, s) => n + (s.fields?.length ?? 0), 0);
  if (!fieldCount) throw badRequest("Add at least one field before publishing.");
  await formModel.update({ id, status: formStatus.PUBLISHED, version: (f.version ?? 0) + 1 }, blameable);
  return getFormFor(id, ownerId);
};

// Stops new submissions (existing ones are untouched).
export const unpublishForm = async (id, ownerId, blameable) => {
  await getFormFor(id, ownerId);
  await formModel.update({ id, status: formStatus.DRAFT }, blameable);
  return getFormFor(id, ownerId);
};

export const deleteForm = async (id, ownerId, blameable) => {
  await getFormFor(id, ownerId);
  if (ownerId !== MASTER_ACCOUNT_ID) {
    const used = await submissionModel.getAllForForm(id);
    if (used.length) throw badRequest(`${used.length} submission${used.length === 1 ? " uses" : "s use"} this form. Delete ${used.length === 1 ? "it" : "them"} first.`);
  }
  await formModel.remove(id, blameable);
};

// Copy of a form into `ownerId`'s forms (a draft, version 0). Cloning a master brings its output
// template along and rebinds the copy to it.
export const cloneForm = async (id, sourceOwnerId, ownerId, blameable) => {
  const src = await getFormFor(id, sourceOwnerId);
  const name = sourceOwnerId === ownerId ? `${src.name} (copy)` : src.name;
  const copy = await createForm({ name, description: src.description, schema: src.schema, settings: src.settings }, ownerId, blameable);
  if (src.templateId) {
    try {
      const t = await cloneTemplate(src.templateId, sourceOwnerId, ownerId, blameable);
      await updateTemplate({ id: t.id, formId: copy.id }, ownerId, blameable); // the template now renders the copy's fields
      return await updateForm({ id: copy.id, templateId: t.id }, ownerId, blameable);
    } catch (err) {
      await formModel.remove(copy.id, blameable); // don't leave a half-cloned form behind
      throw err;
    }
  }
  return copy;
};

export const countForms = async (accountId) => (await formModel.getAllForAccount(accountId)).length;
