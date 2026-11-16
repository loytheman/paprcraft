import { customJoi as Joi } from "./customJoi.js";

// Labels an account puts on its records (name + colour). Records store labelIds, so a rename or
// recolour shows everywhere at once. Private to the account.

export const LABELS_PER_RECORD = 10;
// Keep in step with frontend/design-system/lib/labels.js. None of them is a status colour.
export const labelColors = ["cyan", "blue", "indigo", "violet", "fuchsia", "pink", "slate", "stone"];

let labelModel;
(async () => {
  const m = await import("../services/index.js");
  const table = m.getOneTable();
  labelModel = table.getModel("Label");
})();

export const labelSchema = {
  pk: { type: String, value: "#LABEL:${id}" },
  sk: { type: String, value: "#LABEL#METADATA" },

  gs0pk: { type: String, value: "#ACCOUNT:${accountId}" },
  gs0sk: { type: String, value: "#LABEL#ID:${id}" },

  id: { type: String, generate: "ulid" },
  accountId: { type: String, required: true },
  name: { type: String, required: true },
  color: { type: String, required: true, enum: labelColors },

  createdBy: { type: Object },
  updatedBy: { type: Object },
  auditStreamId: { type: String },
};

export class LabelJoiSchema {
  get createLabel() {
    return {
      name: Joi.string().trim().max(30).required().label("Name"),
      color: Joi.valid(...labelColors).required().label("Colour"),
    };
  }

  get updateLabel() {
    return {
      id: Joi.string().required(),
      name: Joi.string().trim().max(30).label("Name"),
      color: Joi.valid(...labelColors).label("Colour"),
    };
  }

  get byId() {
    return { id: Joi.string().required() };
  }
}

export default {
  create: (data, blameable = null) => {
    const d = blameable ? { ...data, createdBy: blameable.actionBy, auditStreamId: blameable.auditStreamId } : data;
    return labelModel.create(d, { exists: null });
  },
  getById: (id) => labelModel.get({ id }),
  getAllForAccount: (accountId) => labelModel.find({ accountId }, { index: "gs0", limit: 1000 }),
  update: (data, blameable = null) => {
    const d = blameable ? { ...data, updatedBy: blameable.actionBy, auditStreamId: blameable.auditStreamId } : data;
    return labelModel.update(d, { exists: true });
  },
  // The audit trail (backend/lambda/auditRow.js) credits a delete to whoever stamped it just before.
  remove: async (id, blameable = null) => {
    if (blameable) await labelModel.update({ id, updatedBy: blameable.actionBy, auditStreamId: blameable.auditStreamId }, { exists: null });
    return labelModel.remove({ id });
  },
};
