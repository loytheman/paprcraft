import { customJoi as Joi } from "./customJoi.js";

// One filled-in form. `schema` is a snapshot of the form when it was started (so later edits to the
// form never change it); `values` is { key: value } (see helpers/formEngine.js). Status: draft ->
// submitted -> approved | rejected, and any of those back to draft by "reopen".
// A customer can fill a draft through a link: only the SHA-256 of the link's token is stored (gs2),
// with an expiry; it is locked once the customer submits. See service.submission.js.

export const submissionStatus = { DRAFT: "draft", SUBMITTED: "submitted", APPROVED: "approved", REJECTED: "rejected" };

let submissionModel;
(async () => {
  const m = await import("../services/index.js");
  const table = m.getOneTable();
  submissionModel = table.getModel("Submission");
})();

export const submissionSchema = {
  pk: { type: String, value: "#SUBMISSION:${id}" },
  sk: { type: String, value: "#SUBMISSION#METADATA" },

  gs0pk: { type: String, value: "#ACCOUNT:${accountId}" },
  gs0sk: { type: String, value: "#SUBMISSION#ID:${id}" },
  gs1pk: { type: String, value: "#FORM:${formId}" },
  gs1sk: { type: String, value: "#SUBMISSION#ID:${id}" },
  gs2pk: { type: String, value: "#FORMLINK:${tokenHash}" }, // only while a link is active
  gs2sk: { type: String, value: "#SUBMISSION#ID:${id}" },

  id: { type: String, generate: "ulid" },
  accountId: { type: String, required: true },
  formId: { type: String, required: true },
  formName: { type: String },
  formVersion: { type: Number },
  title: { type: String },
  schema: { type: Object },
  values: { type: Object },
  attachments: { type: Array }, // [{ id, path, name, size, type, fieldKey, addedAt }]
  status: { type: String, default: submissionStatus.DRAFT, enum: Object.values(submissionStatus) },
  submittedAt: { type: String },
  submittedBy: { type: Object },
  decidedAt: { type: String },
  decidedBy: { type: Object },
  decisionComment: { type: String },
  signature: { type: Object }, // { name, at, ip, userAgent, consentText } stamped when a customer submits through a link
  exportHistory: { type: Array },
  keywordSearch: { type: String },

  tokenHash: { type: String },
  publicExpiresAt: { type: String },
  publicLockedAt: { type: String },
  publicEmail: { type: String },

  createdBy: { type: Object },
  updatedBy: { type: Object },
  auditStreamId: { type: String },
};

const attachmentItem = Joi.object({
  id: Joi.string(),
  key: Joi.string(),
  name: Joi.string().max(200),
  fieldKey: Joi.string().pattern(/^[a-z][a-z0-9_]{0,59}$/).required(),
}).or("id", "key");

const content = () => ({
  title: Joi.string().trim().allow("").max(150).label("Title"),
  values: Joi.object().unknown(true).label("Answers"),
  attachments: Joi.array().items(attachmentItem).max(100),
});

export class SubmissionJoiSchema {
  get create() {
    return { formId: Joi.string().required(), title: Joi.string().trim().allow("").max(150) };
  }

  get list() {
    return { formId: Joi.string(), status: Joi.valid("draft", "submitted", "approved", "rejected") };
  }

  get save() {
    return { id: Joi.string().required(), ...content() };
  }

  get submit() {
    return { id: Joi.string().required(), ...content() };
  }

  get byId() {
    return { id: Joi.string().required() };
  }

  get exportById() {
    return { id: Joi.string().required(), cbId: Joi.string().required() };
  }

  get decide() {
    return { id: Joi.string().required(), comment: Joi.string().trim().allow("").max(2000) };
  }

  get reject() {
    return { id: Joi.string().required(), comment: Joi.string().trim().min(3).max(2000).required().label("Reason") };
  }

  get link() {
    return { id: Joi.string().required(), email: Joi.string().trim().email().allow(""), expiresInDays: Joi.number().integer().min(1).max(90).default(14) };
  }

  get attachmentUrl() {
    return { id: Joi.string().required(), contentType: Joi.string().required() };
  }

  // Public (customer link) requests: the token is the credential.
  get tokenOnly() {
    return { token: Joi.string().pattern(/^[A-Za-z0-9_-]{20,100}$/).required() };
  }

  get publicSave() {
    return { token: Joi.string().pattern(/^[A-Za-z0-9_-]{20,100}$/).required(), values: Joi.object().unknown(true), attachments: Joi.array().items(attachmentItem).max(100) };
  }

  get publicAttachmentUrl() {
    return { token: Joi.string().pattern(/^[A-Za-z0-9_-]{20,100}$/).required(), contentType: Joi.string().required() };
  }
}

const stamp = (data, blameable, field) => (blameable ? { ...data, [field]: blameable.actionBy, auditStreamId: blameable.auditStreamId } : data);
const LIST_FIELDS = ["id", "accountId", "formId", "formName", "formVersion", "title", "status", "submittedAt", "submittedBy", "decidedAt", "decidedBy", "createdAt", "updatedAt", "createdBy", "publicExpiresAt", "publicLockedAt"];

export default {
  create: (data, blameable = null) => submissionModel.create(stamp(data, blameable, "createdBy"), { exists: null }),
  getById: (id) => submissionModel.get({ id }),
  getAllForAccount: async (accountId, { full = false } = {}) => {
    const rows = await submissionModel.find({ accountId }, { index: "gs0", limit: 5000, ...(!full && { fields: LIST_FIELDS }) });
    return rows.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  },
  getAllForForm: (formId) => submissionModel.find({ formId }, { index: "gs1", limit: 5000, fields: ["id", "accountId", "status"] }),
  getByTokenHash: async (tokenHash) => (await submissionModel.find({ tokenHash }, { index: "gs2", limit: 1 }))[0] ?? null,
  update: (data, blameable = null) => submissionModel.update(stamp(data, blameable, "updatedBy"), { exists: true, partial: false }),
  // Takes the link away (the index keys go with the hash).
  removeLink: (id, blameable = null) =>
    submissionModel.update(
      { id, ...(blameable && { updatedBy: blameable.actionBy, auditStreamId: blameable.auditStreamId }) },
      { exists: true, remove: ["tokenHash", "publicExpiresAt", "publicEmail", "gs2pk", "gs2sk"] }
    ),
  remove: async (id, blameable = null) => {
    if (blameable) await submissionModel.update({ id, updatedBy: blameable.actionBy, auditStreamId: blameable.auditStreamId }, { exists: null });
    return submissionModel.remove({ id });
  },
  // Appends one export entry (the docx Lambda completes it by cbId).
  addExport: (id, entry, blameable = null) =>
    submissionModel.update(
      { id },
      {
        set: { exportHistory: "list_append(if_not_exists(exportHistory, @{empty}), @{entry})", ...(blameable && { updatedBy: blameable.actionBy, auditStreamId: blameable.auditStreamId }) },
        substitutions: { entry: [entry], empty: [] },
        exists: true,
      }
    ),
};
