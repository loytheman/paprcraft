import { customJoi as Joi } from "./customJoi.js";

// Document templates: a name, ordered sections of editor blocks (section[].list, the JSON the
// dashboard editor produces and backend/lambda/docxTemplate.js renders), free-form placeholder
// values, and the history of .docx exports. Owned by an account, or by MASTER_ACCOUNT_ID for the
// staff-published masters any account can clone. See service.template.js.

// accountId of the staff-managed master templates (never a real account's ulid).
export const MASTER_ACCOUNT_ID = "MASTER";

let templateModel;
(async () => {
  const m = await import("../services/index.js");
  const table = m.getOneTable();
  templateModel = table.getModel("Template");
})();

export const exportStatus = { PROCESSING: "processing", COMPLETED: "completed", FAILED: "failed" };

export const templateSchema = {
  pk: { type: String, value: "#TEMPLATE:${id}" },
  sk: { type: String, value: "#TEMPLATE#METADATA" },

  gs0pk: { type: String, value: "#ACCOUNT:${accountId}" },
  gs0sk: { type: String, value: "#TEMPLATE#ID:${id}" },

  id: { type: String, generate: "ulid" },
  accountId: { type: String, required: true },
  name: { type: String, required: true },
  section: { type: Array }, // [{ name, list: [block, ...] }]
  placeholders: { type: Object }, // { KEY: "value" }: defaults for {{KEY}} chips
  // [{ cbId, processStatus: processing|completed|failed, createdAt, createdBy, path, fileName, error,
  //    pdf (asked for), pdfStatus: processing|completed|failed, pdfPath, pdfError }]
  // appended by the API, completed by the docx Lambda (matched by cbId).
  exportHistory: { type: Array },
  keywordSearch: { type: String },
  // Page look: style "letter" (default: Arial, 20 mm margins) or "form" (Calibri, narrow margins, grey table headers, like the CDD forms).
  style: { type: String, enum: ["letter", "form"] },
  // Repeating page header / footer of every page (strings may hold {{key}} placeholders and the built-ins
  // {{submission_ref}}, {{submission_title}}, {{generated_date}}): { headerLeft, headerRight, footerLeft }. Footer right is always "Page N/M".
  frame: { type: Object },
  formId: { type: String }, // the form whose fields this template renders (the editor offers its keys); see service.form.js

  createdBy: { type: Object },
  updatedBy: { type: Object },
  auditStreamId: { type: String },
};

const sectionSchema = Joi.object({
  name: Joi.string().trim().max(100).required(),
  list: Joi.array().default([]),
});

const fields = () => ({
  name: Joi.string().trim().max(150).label("Name"),
  section: Joi.array().items(sectionSchema).min(1).max(30).label("Sections"),
  placeholders: Joi.object().pattern(Joi.string().max(100), Joi.string().allow("").max(2000)).label("Placeholders"),
  formId: Joi.string().allow(null, ""),
  style: Joi.valid("letter", "form"),
  frame: Joi.object({ headerLeft: Joi.string().allow("").max(200), headerRight: Joi.string().allow("").max(200), footerLeft: Joi.string().allow("").max(200) }).allow(null),
});

export class TemplateJoiSchema {
  get create() {
    return { ...fields(), name: Joi.string().trim().max(150).required().label("Name") };
  }

  get update() {
    return { id: Joi.string().required(), ...fields() };
  }

  get byId() {
    return { id: Joi.string().required() };
  }

  get exportById() {
    return { id: Joi.string().required(), cbId: Joi.string().required() };
  }

  get search() {
    return { keyword: Joi.string().trim().lowercase().allow("").max(100) };
  }

  // values: this export's placeholder values (they override the saved ones).
  get generate() {
    return {
      id: Joi.string().required(),
      values: Joi.object().pattern(Joi.string().max(100), Joi.string().allow("").max(2000)),
      pdf: Joi.boolean(), // also make a PDF from the finished Word file
    };
  }
}

const stamp = (data, blameable, field) => (blameable ? { ...data, [field]: blameable.actionBy, auditStreamId: blameable.auditStreamId } : data);
// Row fields the list shows (no section: it is large).
const LIST_FIELDS = ["id", "accountId", "name", "createdAt", "updatedAt", "createdBy", "updatedBy"];

export default {
  create: (data, blameable = null) => templateModel.create(stamp(data, blameable, "createdBy"), { exists: null }),
  getById: (id) => templateModel.get({ id }),
  // Newest edit first.
  getAllForAccount: async (accountId, { full = false } = {}) => {
    const rows = await templateModel.find({ accountId }, { index: "gs0", limit: 1000, ...(!full && { fields: LIST_FIELDS }) });
    return rows.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  },
  // partial: false so removing a placeholder key (or section) really removes it.
  update: (data, blameable = null) => templateModel.update(stamp(data, blameable, "updatedBy"), { exists: true, partial: false }),
  // The audit trail (backend/lambda/auditRow.js) credits a delete to whoever stamped it just before.
  remove: async (id, blameable = null) => {
    if (blameable) await templateModel.update({ id, updatedBy: blameable.actionBy, auditStreamId: blameable.auditStreamId }, { exists: true }); // not an upsert: that would reset defaults such as `status` and be audited as a change
    return templateModel.remove({ id });
  },
  // Appends one export entry (keeps the audit stamp so the export is credited to the person).
  addExport: (id, entry, blameable = null) =>
    templateModel.update(
      { id },
      {
        set: { exportHistory: "list_append(if_not_exists(exportHistory, @{empty}), @{entry})", ...(blameable && { updatedBy: blameable.actionBy, auditStreamId: blameable.auditStreamId }) },
        substitutions: { entry: [entry], empty: [] },
        exists: true,
      }
    ),
};
