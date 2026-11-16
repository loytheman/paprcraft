import httpStatus from "http-status";
import labelModel from "../models/model.label.js";
import { getAccountPlan, planLimitError, isTopPlan, includesText } from "./service.plan.js";
import { ApiError, errorType, errorMessage } from "../middlewares/error.js";

const badRequest = (msg) => new ApiError(httpStatus.BAD_REQUEST, errorType.BAD_REQUEST, msg);
const notFound = () => new ApiError(httpStatus.NOT_FOUND, errorType.NOT_FOUND, errorMessage.NOT_FOUND);

const getLabelForAccount = async (id, accountId) => {
  const l = await labelModel.getById(id);
  if (!l || l.accountId !== accountId) throw notFound();
  return l;
};

// Names are unique per account, ignoring case, so the filter bar never shows two "prod" chips.
const assertNameFree = (labels, name, exceptId = null) => {
  if (labels.some((l) => l.id !== exceptId && l.name.toLowerCase() === name.toLowerCase())) throw badRequest(`You already have a label called "${name}".`);
};

// Every id must be one of the account's labels.
export const assertOwnLabels = async (accountId, labelIds = []) => {
  if (!labelIds?.length) return;
  const own = new Set((await labelModel.getAllForAccount(accountId)).map((l) => l.id));
  if (labelIds.some((id) => !own.has(id))) throw badRequest("Some of the selected labels don't exist.");
};

// Alphabetical, so pickers and the filter bar read the same everywhere.
export const listLabels = async (accountId) =>
  (await labelModel.getAllForAccount(accountId)).sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));

export const createLabel = async ({ name, color }, accountId, blameable) => {
  const [labels, plan] = await Promise.all([labelModel.getAllForAccount(accountId), getAccountPlan(accountId)]);
  if (labels.length >= plan.labelLimit) {
    throw planLimitError(`${includesText(plan, "labelLimit")} ${plan.labelLimit} labels. ${isTopPlan(plan) ? "Delete one first." : "Upgrade for more, or delete one first."}`);
  }
  assertNameFree(labels, name);
  return labelModel.create({ accountId, name, color }, blameable);
};

export const updateLabel = async ({ id, name, color }, accountId, blameable) => {
  await getLabelForAccount(id, accountId);
  if (name !== undefined) assertNameFree(await labelModel.getAllForAccount(accountId), name, id);
  const data = { id };
  if (name !== undefined) data.name = name;
  if (color !== undefined) data.color = color;
  await labelModel.update(data, blameable);
  return labelModel.getById(id);
};

// Labels are referenced by id from your own records (labelIds). When you add a record type that
// uses them, take the label off those records here before removing it, so nothing points at a
// missing label.
export const deleteLabel = async (id, accountId, blameable) => {
  await getLabelForAccount(id, accountId);
  await labelModel.remove(id, blameable);
};
