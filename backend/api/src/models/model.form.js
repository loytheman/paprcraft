import { customJoi as Joi } from "./customJoi.js";

// A dynamic form definition: sections of fields (see helpers/formEngine.js for the schema). Owned
// by an account, or by MASTER_ACCOUNT_ID for the staff-managed masters accounts clone (CDD...).
// `version` goes up each time the form is published; a submission snapshots the schema it starts
// from, so editing a form never changes submissions already created. See service.form.js.

export const formStatus = { DRAFT: "draft", PUBLISHED: "published" };

let formModel;
(async () => {
  const m = await import("../services/index.js");
  const table = m.getOneTable();
  formModel = table.getModel("Form");
})();

export const formSchema = {
  pk: { type: String, value: "#FORM:${id}" },
  sk: { type: String, value: "#FORM#METADATA" },

  gs0pk: { type: String, value: "#ACCOUNT:${accountId}" },
  gs0sk: { type: String, value: "#FORM#ID:${id}" },

  id: { type: String, generate: "ulid" },
  accountId: { type: String, required: true },
  name: { type: String, required: true },
  description: { type: String },
  status: { type: String, default: formStatus.DRAFT, enum: Object.values(formStatus) },
  version: { type: Number, default: 0 }, // 0 until first published
  schema: { type: Object }, // { sections: [...] }
  // { intro, consentText, publicEnabled, requireApprovedToExport, publicTitle }
  settings: { type: Object },
  templateId: { type: String }, // the document template that renders a submission (service.submission.js generate)
  keywordSearch: { type: String },

  createdBy: { type: Object },
  updatedBy: { type: Object },
  auditStreamId: { type: String },
};

const settings = Joi.object({
  intro: Joi.string().allow("").max(2000),
  consentText: Joi.string().allow("").max(2000),
  publicTitle: Joi.string().allow("").max(150),
  publicEnabled: Joi.boolean(),
  requireApprovedToExport: Joi.boolean(),
});

export class FormJoiSchema {
  get create() {
    return {
      name: Joi.string().trim().max(150).required().label("Name"),
      description: Joi.string().trim().allow("").max(1000).label("Description"),
      schema: Joi.object().unknown(true).label("Form"),
      settings,
    };
  }

  get update() {
    return {
      id: Joi.string().required(),
      name: Joi.string().trim().max(150).label("Name"),
      description: Joi.string().trim().allow("").max(1000).label("Description"),
      schema: Joi.object().unknown(true).label("Form"),
      settings,
      templateId: Joi.string().allow(null, ""),
    };
  }

  get byId() {
    return { id: Joi.string().required() };
  }
}

const stamp = (data, blameable, field) => (blameable ? { ...data, [field]: blameable.actionBy, auditStreamId: blameable.auditStreamId } : data);
const LIST_FIELDS = ["id", "accountId", "name", "description", "status", "version", "templateId", "createdAt", "updatedAt", "createdBy", "updatedBy"];

export default {
  create: (data, blameable = null) => formModel.create(stamp(data, blameable, "createdBy"), { exists: null }),
  getById: (id) => formModel.get({ id }),
  getAllForAccount: async (accountId, { full = false } = {}) => {
    const rows = await formModel.find({ accountId }, { index: "gs0", limit: 1000, ...(!full && { fields: LIST_FIELDS }) });
    return rows.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  },
  // partial: false so removing a setting or a field really removes it.
  update: (data, blameable = null) => formModel.update(stamp(data, blameable, "updatedBy"), { exists: true, partial: false }),
  remove: async (id, blameable = null) => {
    if (blameable) await formModel.update({ id, updatedBy: blameable.actionBy, auditStreamId: blameable.auditStreamId }, { exists: null });
    return formModel.remove({ id });
  },
};
