import { customJoi as Joi } from "./customJoi.js";

// Value sets: named sets of placeholder values an account keeps ({ KEY: "value" }), e.g. one per
// client company. A template only names its {{KEY}} chips; the set picked in the editor (saved as
// template.valueSetId) or at export fills them in. See service.valueSet.js.

export const MAX_VALUE_SETS = 100;
export const MAX_VALUES_PER_SET = 200;

let valueSetModel;
(async () => {
  const m = await import("../services/index.js");
  const table = m.getOneTable();
  valueSetModel = table.getModel("ValueSet");
})();

export const valueSetSchema = {
  pk: { type: String, value: "#VALUESET:${id}" },
  sk: { type: String, value: "#VALUESET#METADATA" },

  gs0pk: { type: String, value: "#ACCOUNT:${accountId}" },
  gs0sk: { type: String, value: "#VALUESET#ID:${id}" },

  id: { type: String, generate: "ulid" },
  accountId: { type: String, required: true },
  name: { type: String, required: true },
  values: { type: Object }, // { KEY: "value" }

  createdBy: { type: Object },
  updatedBy: { type: Object },
  auditStreamId: { type: String },
};

const valuesSchema = () => Joi.object().pattern(Joi.string().max(100), Joi.string().allow("").max(2000)).max(MAX_VALUES_PER_SET).label("Values");

export class ValueSetJoiSchema {
  get create() {
    return {
      name: Joi.string().trim().max(100).required().label("Name"),
      values: valuesSchema(),
    };
  }

  get update() {
    return {
      id: Joi.string().required(),
      name: Joi.string().trim().max(100).label("Name"),
      values: valuesSchema(),
    };
  }

  get byId() {
    return { id: Joi.string().required() };
  }
}

const stamp = (data, blameable, field) => (blameable ? { ...data, [field]: blameable.actionBy, auditStreamId: blameable.auditStreamId } : data);

export default {
  create: (data, blameable = null) => valueSetModel.create(stamp(data, blameable, "createdBy"), { exists: null }),
  getById: (id) => valueSetModel.get({ id }),
  getAllForAccount: (accountId) => valueSetModel.find({ accountId }, { index: "gs0", limit: 1000 }),
  // partial: false so a removed key really goes from `values`.
  update: (data, blameable = null) => valueSetModel.update(stamp(data, blameable, "updatedBy"), { exists: true, partial: false }),
  // The audit trail (backend/lambda/auditRow.js) credits a delete to whoever stamped it just before.
  remove: async (id, blameable = null) => {
    if (blameable) await valueSetModel.update({ id, updatedBy: blameable.actionBy, auditStreamId: blameable.auditStreamId }, { exists: true });
    return valueSetModel.remove({ id });
  },
};
