// paprcraft plans and what each allows. The single source for limits, enforced in:
//   service.label.js   label count
//   service.template.js  template count (own templates; masters are unlimited)
//   service.team.js    team size (teamLimit; 1 = no team)
// There is no billing yet: every account is on "free" unless staff made it complimentary
// (billingExempt, compPlan) or set per-account limitOverrides. When billing is added, copy the
// plan onto the account row (`plan`) and planOf() will pick it up.
// On top of the plan, staff can set per-account limits (limitOverrides), higher or lower than the
// plan's, each with an optional end date; getAccountPlan() returns the result.
import httpStatus from "http-status";
import { getOneTable } from "./index.js";
import { ApiError, errorType } from "../middlewares/error.js";

// teamLimit = people who can use the account, the owner included (1 = no team).
// labelLimit = how many labels the account can have. Add your own limit fields here, then list
// them in LIMIT_FIELDS and LIMIT_RANGES so staff can override them.
export const PLANS = {
  free: { name: "Free", labelLimit: 10, templateLimit: 5, teamLimit: 1, priceCents: 0, yearlyPriceCents: 0 },
  pro: { name: "Pro", labelLimit: 30, templateLimit: 100, teamLimit: 5, priceCents: 0, yearlyPriceCents: 0 }, // TODO: set prices
};
// priceCents = per month on monthly billing; yearlyPriceCents = per year on yearly billing.
export const BILLING_INTERVALS = ["month", "year"];
export const PLAN_ORDER = ["free", "pro"];
export const TOP_PLAN = PLAN_ORDER.at(-1);
// For limit messages: on the top plan there's nothing to upgrade to.
export const isTopPlan = (plan) => plan.key === TOP_PLAN;

// The plan an account row is on.
export const COMP_PLANS = ["pro"];
export const planOf = (account) =>
  account?.billingExempt ? (COMP_PLANS.includes(account.compPlan) ? account.compPlan : TOP_PLAN) : PLANS[account?.plan] ? account.plan : "free";

// The limits staff can set per account (limitOverrides: { field: { value, until? } }).
export const LIMIT_FIELDS = ["labelLimit", "templateLimit", "teamLimit"];
export const LIMIT_RANGES = {
  labelLimit: [0, 500], templateLimit: [0, 5000], teamLimit: [1, 50],
};
const isLive = (o, now) => o && Number.isFinite(o.value) && (!o.until || Date.parse(o.until) > now);

// { key, ...plan limits with live overrides applied, custom: { field: { value, until, planValue } } }
export const limitsFor = (account, now = Date.now()) => {
  const key = planOf(account);
  const base = PLANS[key];
  const custom = {};
  const limits = { key, ...base };
  for (const f of LIMIT_FIELDS) {
    const o = account?.limitOverrides?.[f];
    if (!isLive(o, now)) continue;
    limits[f] = o.value;
    custom[f] = { value: o.value, until: o.until ?? null, planValue: base[f] };
  }
  return { ...limits, custom, suspended: account?.accountStatus === "suspended" };
};

export const SUSPENDED_MESSAGE = "This account is suspended. Please contact Paprcraft support.";
// A suspended account (staff, service.staff.js) can't create or change things.
export const assertNotSuspended = (plan) => {
  if (plan?.suspended) throw new ApiError(httpStatus.FORBIDDEN, errorType.ACCOUNT_SUSPENDED, SUSPENDED_MESSAGE);
};

// Overrides that have passed their end date (the daily sweep removes them).
export const expiredOverrides = (account, now = Date.now()) =>
  LIMIT_FIELDS.filter((f) => account?.limitOverrides?.[f] && !isLive(account.limitOverrides[f], now));

let accountModel;
const getAccountModel = () => (accountModel ??= getOneTable().getModel("Account"));

// { key, ...limits } for an account id. A missing account is treated as Free.
export const getAccountPlan = async (accountId) => {
  const account = await getAccountModel().get({ id: accountId });
  return limitsFor(account);
};

// The start of a limit message: "Your Pro plan includes", or "Your account includes" when
// Paprcraft support set that limit for this account.
export const includesText = (plan, field) => (plan?.custom?.[field] ? "Your account includes" : `Your ${plan.name} plan includes`);

// The lowest plan that allows `test(plan)`, for "available on Pro" messages.
export const lowestPlanWhere = (test) => PLANS[PLAN_ORDER.find((k) => test(PLANS[k]))]?.name ?? "a higher";

// 402 with a message the dashboard shows as is, and a `planLimit` flag so it can offer an upgrade.
export const planLimitError = (message) => {
  const err = new ApiError(httpStatus.PAYMENT_REQUIRED, errorType.BAD_REQUEST, message);
  err.planLimit = true;
  return err;
};
