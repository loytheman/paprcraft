// Paprcraft staff console (routes under /staff, requireAdmin): look up customers and change what
// their account allows. Every change needs a reason, is stamped as a staff action (the customer's
// own Activity shows "Paprcraft support"; staff see who), and lands in the audit trail.
//   complimentary  never billed, on Pro (billingExempt + compPlan on the account)
//   limits         per-account overrides of plan limits, higher or lower, optionally until a date
//                  (service.plan.js limitsFor); the daily sweep removes the ended ones
//   suspend        signs the customer out everywhere and blocks sign-in and changes
//   notes          internal notes, never shown to the customer
import httpStatus from "http-status";
import config from "../config/config.js";
import { getOneTable } from "./index.js";
import { ApiError, errorType } from "../middlewares/error.js";
import { customJoi as Joi } from "../models/customJoi.js";
import labelModel from "../models/model.label.js";
import { tokenType } from "../models/model.token.js";
import { PLANS, COMP_PLANS, LIMIT_FIELDS, LIMIT_RANGES, planOf, limitsFor, expiredOverrides } from "./service.plan.js";
import { onTeamPlanChange, getTeam, getStaffMemberships } from "./service.team.js";

const accounts = () => getOneTable().getModel("Account");
const tokens = () => getOneTable().getModel("Token");

const notFound = () => new ApiError(httpStatus.NOT_FOUND, errorType.NOT_FOUND, "No such customer.");
const badRequest = (msg) => new ApiError(httpStatus.BAD_REQUEST, errorType.BAD_REQUEST, msg);

// Partial update of an Account row ({ set } leaves its templated index keys alone); null removes
// a field. Free text goes in as a substitution so OneTable never reads it as an expression.
const updateAccount = (id, fields, text = {}) => {
  const set = {};
  const remove = [];
  for (const [k, v] of Object.entries(fields)) v === null ? remove.push(k) : (set[k] = v);
  for (const [k, v] of Object.entries(text)) v === null || v === "" ? remove.push(k) : (set[k] = `@{${k}}`);
  const substitutions = Object.fromEntries(Object.entries(text).filter(([, v]) => v));
  return accounts().update({ id }, { set, ...(remove.length && { remove }), ...(Object.keys(substitutions).length && { substitutions }) });
};

const getAccount = async (id) => {
  const a = await accounts().get({ id });
  if (!a) throw notFound();
  return a;
};

// Who did it and why, on the account row itself (shown on the staff page; in the audit trail too).
const staffStamp = (action, reason, blameable) => ({
  lastStaffAction: { action, reason, at: new Date().toISOString(), by: blameable?.actionBy?.name || blameable?.actionBy?.email || null },
  updatedBy: blameable.actionBy,
  auditStreamId: blameable.auditStreamId,
});

// ---- Customers list ------------------------------------------------------------------------

const LIST_FIELDS = [
  "id", "email", "firstName", "lastName", "createdAt", "signedInAt", "role", "accountStatus", "plan", "billingStatus",
  "cancelAt", "billingExempt", "compPlan", "limitOverrides",
];
// Limits that only accept fixed values (a select, not a number box): { field: [values] }.
const LIMIT_OPTIONS = {};
const PAST_DUE = ["past_due", "unpaid", "incomplete"];

// Every customer account (the staff list filters and searches in memory: fine into the thousands).
const allAccounts = async (fields = LIST_FIELDS) => {
  const out = [];
  let next;
  do {
    const page = await accounts().find({ organizationId: config.defaultOrganizationId }, { index: "gs0", limit: 500, next, fields, reverse: true });
    out.push(...page);
    next = page.next;
  } while (next && out.length < 20000);
  return out;
};

const nameOf = (a) => [a.firstName, a.lastName].filter(Boolean).join(" ") || null;
const listRow = (a) => {
  const limits = limitsFor(a);
  return {
    id: a.id,
    email: a.email,
    name: nameOf(a),
    createdAt: a.createdAt,
    signedInAt: a.signedInAt ?? null,
    staff: a.role === "administrator",
    status: a.accountStatus ?? "normal",
    plan: planOf(a),
    complimentary: !!a.billingExempt,
    billingStatus: a.billingStatus ?? null,
    cancelAt: a.cancelAt ?? null,
    customLimits: Object.keys(limits.custom).length,
    labelLimit: limits.labelLimit,
  };
};

export const FILTERS = {
  paying: (r) => !r.complimentary && r.plan !== "free" && !PAST_DUE.includes(r.billingStatus),
  free: (r) => !r.complimentary && r.plan === "free",
  complimentary: (r) => r.complimentary,
  pastDue: (r) => PAST_DUE.includes(r.billingStatus),
  custom: (r) => r.customLimits > 0,
  suspended: (r) => r.status === "suspended",
  staff: (r) => r.staff,
};

export const listCustomers = async ({ q, filter, limit = 50, offset = 0 }) => {
  const rows = (await allAccounts()).map(listRow);
  const counts = Object.fromEntries(Object.entries(FILTERS).map(([k, f]) => [k, rows.filter(f).length]));
  const needle = q?.trim().toLowerCase();
  const matched = rows
    .filter((r) => !filter || FILTERS[filter](r))
    .filter((r) => !needle || r.id.toLowerCase() === needle || `${r.email ?? ""} ${r.name ?? ""}`.toLowerCase().includes(needle))
    .sort((a, b) => b.id.localeCompare(a.id)); // ulid: newest first
  const page = matched.slice(offset, offset + limit);
  // Per-row usage (e.g. counts of your own records) goes here: one query per row on this page.
  const withUsage = await Promise.all(page.map(async (r) => ({ ...r, labels: (await labelModel.getAllForAccount(r.id)).length })));
  return { customers: withUsage, total: rows.length, matched: matched.length, counts, offset, limit };
};

// ---- One customer --------------------------------------------------------------------------

export const getCustomer = async (id) => {
  const a = await getAccount(id);
  const [labels, team, memberships] = await Promise.all([labelModel.getAllForAccount(id), getTeam(id), getStaffMemberships(id)]);
  const limits = limitsFor(a);
  return {
    account: {
      ...listRow(a),
      mobile: a.mobileFull ?? null,
      emailVerified: !!a.emailVerified,
      compPlan: a.billingExempt ? planOf(a) : null,
      notes: a.internalNotes ?? "",
      lastStaffAction: a.lastStaffAction ?? null,
      billingAdminNote: a.billingAdminNote ?? null,
    },
    usage: { labels: labels.length },
    // Per limit: what the plan gives, what applies now, and any override (live or ended).
    limits: LIMIT_FIELDS.map((field) => ({
      field,
      plan: PLANS[limits.key][field],
      effective: limits[field],
      override: a.limitOverrides?.[field] ?? null,
      live: !!limits.custom[field],
      range: LIMIT_RANGES[field],
      options: LIMIT_OPTIONS[field] ?? null, // only these values (a select, not a number box)
    })),
    // Their team (people in this account) and the other accounts they're on the team of.
    team: { members: team.members, seats: team.seats, available: team.available },
    memberships,
  };
};

// ---- Actions -------------------------------------------------------------------------------

// plan: "pro" to make it complimentary, null to end it. Wire this to your billing service once
// there is one (it should also stop billing); for now it only flags the account.
export const setComplimentary = async (id, { plan, reason }, blameable) => {
  await getAccount(id);
  await updateAccount(id, { billingExempt: !!plan, compPlan: plan ?? null, ...staffStamp(plan ? `complimentary: ${plan}` : "complimentary ended", reason, blameable) });
  return getCustomer(id);
};

// limits: { field: { value, until? } | null }: null removes the override (back to the plan's).
export const setLimits = async (id, { limits, reason }, blameable) => {
  const a = await getAccount(id);
  const next = { ...(a.limitOverrides ?? {}) };
  for (const [field, o] of Object.entries(limits)) {
    if (!LIMIT_FIELDS.includes(field)) throw badRequest(`Unknown limit: ${field}.`);
    if (o === null) {
      delete next[field];
      continue;
    }
    const [min, max] = LIMIT_RANGES[field];
    if (LIMIT_OPTIONS[field] && !LIMIT_OPTIONS[field].includes(o.value)) throw badRequest(`${field} must be one of ${LIMIT_OPTIONS[field].join(", ")}.`);
    if (!Number.isInteger(o.value) || o.value < min || o.value > max) throw badRequest(`${field} must be a whole number from ${min} to ${max}.`);
    if (o.until && !(Date.parse(o.until) > Date.now())) throw badRequest("The end date must be in the future.");
    next[field] = { value: o.value, ...(o.until && { until: new Date(o.until).toISOString() }) };
  }
  const summary = Object.entries(limits).map(([f, o]) => (o === null ? `${f} back to plan` : `${f} ${o.value}${o.until ? ` until ${o.until.slice(0, 10)}` : ""}`)).join(", ");
  await updateAccount(id, { limitOverrides: Object.keys(next).length ? next : null, ...staffStamp(`limits: ${summary}`, reason, blameable) });
  // A custom team limit can turn a team's access off or back on, as a plan change does.
  await onTeamPlanChange(id, limitsFor(a).teamLimit, limitsFor({ ...a, limitOverrides: next }).teamLimit).catch(() => {});
  return getCustomer(id);
};

const signOutEverywhere = async (accountId) => {
  const list = await tokens().find({ refId: accountId, tokenType: tokenType.REFRESH }, { index: "gs2" });
  await Promise.all(list.map((t) => tokens().remove({ id: t.id })));
  return list.length;
};

export const setStatus = async (id, { status, reason }, blameable) => {
  const a = await getAccount(id);
  const current = a.accountStatus ?? "normal";
  if (status === current) throw badRequest(status === "suspended" ? "Already suspended." : "Not suspended.");
  if (status === "suspended") {
    await updateAccount(id, { accountStatus: "suspended", ...staffStamp("suspended", reason, blameable) });
    const sessions = await signOutEverywhere(id);
    return { ...(await getCustomer(id)), sessionsEnded: sessions };
  }
  await updateAccount(id, { accountStatus: "normal", ...staffStamp("unsuspended", reason, blameable) });
  return getCustomer(id);
};

export const setNotes = async (id, { notes }, blameable) => {
  await getAccount(id);
  await updateAccount(id, { updatedBy: blameable.actionBy, auditStreamId: blameable.auditStreamId }, { internalNotes: notes.trim() || null });
  return getCustomer(id);
};

// ---- Daily sweep ---------------------------------------------------------------------------

// Removes limit overrides past their end date.
// Runs daily from EventBridge (backend/infra/27-staff-sweep.sh -> app-lambda.js). Limits already
// stop counting at the end date (limitsFor); this just tidies the rows. If a limit can leave an
// account over it (e.g. record counts), pause or trim the excess here.
export const expireLimitOverrides = async (now = Date.now()) => {
  const all = await allAccounts(["id", "limitOverrides"]);
  const ended = [];
  for (const a of all) {
    const fields = expiredOverrides(a, now);
    if (!fields.length) continue;
    const left = Object.fromEntries(Object.entries(a.limitOverrides).filter(([f]) => !fields.includes(f)));
    await updateAccount(a.id, { limitOverrides: Object.keys(left).length ? left : null });
    ended.push({ accountId: a.id, fields });
  }
  console.log(JSON.stringify({ msg: "limit overrides expired", count: ended.length, ended }));
  return ended;
};

// ---- Request validation --------------------------------------------------------------------

const reason = () => Joi.string().trim().min(3).max(500).required();

export class StaffJoiSchema {
  get list() {
    return {
      q: Joi.string().trim().max(200).allow(""),
      filter: Joi.valid(...Object.keys(FILTERS)),
      limit: Joi.number().integer().min(1).max(200).default(50),
      offset: Joi.number().integer().min(0).default(0),
    };
  }

  get byId() {
    return { id: Joi.string().required() };
  }

  get complimentary() {
    return { id: Joi.string().required(), plan: Joi.valid(...COMP_PLANS).allow(null).required(), reason: reason() };
  }

  get limits() {
    const one = Joi.object({ value: Joi.number().integer().required(), until: Joi.string().isoDate().allow(null) }).allow(null);
    return {
      id: Joi.string().required(),
      limits: Joi.object(Object.fromEntries(LIMIT_FIELDS.map((f) => [f, one]))).min(1).required(),
      reason: reason(),
    };
  }

  get status() {
    return { id: Joi.string().required(), status: Joi.valid("normal", "suspended").required(), reason: reason() };
  }

  get notes() {
    return { id: Joi.string().required(), notes: Joi.string().allow("").max(5000).required() };
  }
}
