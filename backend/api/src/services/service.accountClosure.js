// Closing an account, for good and straight away: by its owner (Settings > Account, "Close
// account") or by Paprcraft staff (staff console). Everything that would keep running is stopped
// first, in an order that's safe to retry: if a step fails the account still exists, so it can
// simply be tried again.
//   1. Delete the account's data: labels and uploaded files. ADD YOUR OWN record types here, and
//      cancel any subscription first once there is billing (stop if that fails, so the account is
//      never deleted while still billing).
//   2. Remove its team, end its sessions and delete the account.
//   3. Email the owner a confirmation.
// Kept on purpose: the audit trail (activity records) and server logs. Access tokens can't be
// revoked and live up to 8 hours; refresh tokens are deleted here and the session cookies cleared
// by the controller.
import httpStatus from "http-status";
import { getOneTable } from "./index.js";
import { ApiError, errorType } from "../middlewares/error.js";
import { customJoi as Joi } from "../models/customJoi.js";
import labelModel from "../models/model.label.js";
import templateModel from "../models/model.template.js";
import formModel from "../models/model.form.js";
import submissionModel from "../models/model.submission.js";
import { tokenType } from "../models/model.token.js";
import { removeForClosedAccount } from "./service.team.js";
import { deleteFolder, accountFolder } from "./service.attachment.js";
import { planOf, PLANS } from "./service.plan.js";
import { sendEmail } from "./service.email.js";
import { accountClosedEmail } from "../emails/email.accountClosed.js";

const accounts = () => getOneTable().getModel("Account");
const tokens = () => getOneTable().getModel("Token");
const LIVE = ["active", "trialing", "past_due"];
const sameEmail = (a, b) => String(a ?? "").trim().toLowerCase() === String(b ?? "").trim().toLowerCase();

const getAccount = async (accountId) => {
  const account = await accounts().get({ id: accountId });
  if (!account) throw new ApiError(httpStatus.NOT_FOUND, errorType.NOT_FOUND, "Account not found.");
  return account;
};

// What closing this account would remove: the confirmation dialog shows it.
export const getClosurePreview = async (accountId) => {
  const account = await getAccount(accountId);
  const [labels, templates, forms, submissions] = await Promise.all([labelModel.getAllForAccount(accountId), templateModel.getAllForAccount(accountId), formModel.getAllForAccount(accountId), submissionModel.getAllForAccount(accountId)]);
  const hasPlan = !!account.stripeSubscriptionId && LIVE.includes(account.billingStatus) && !account.billingExempt;
  return {
    email: account.email,
    staff: account.role === "administrator",
    plan: hasPlan ? PLANS[planOf(account)].name : null,
    periodEnd: hasPlan ? account.currentPeriodEnd ?? null : null,
    counts: {
      labels: labels.length,
      templates: templates.length,
      forms: forms.length,
      submissions: submissions.length,
    },
  };
};

// byStaff: from the staff console. Self-service needs the account's email typed back, and isn't
// open to staff accounts, so staff can't lock themselves out by accident.
// reason: staff only, kept on the account's last audit stamp (lastStaffAction).
export const closeAccount = async (accountId, { confirmEmail, byStaff = false, reason = null, blameable = null } = {}) => {
  const account = await getAccount(accountId);
  if (!byStaff) {
    if (account.role === "administrator") {
      throw new ApiError(httpStatus.FORBIDDEN, errorType.NO_PERMISSION, "Staff accounts can't be closed here. Remove the staff role first.");
    }
    if (!sameEmail(confirmEmail, account.email)) {
      throw new ApiError(httpStatus.BAD_REQUEST, errorType.BAD_REQUEST, "That doesn't match your account's email address.");
    }
  }
  const preview = await getClosurePreview(accountId);

  const hadPlan = false; // TODO: cancel the subscription here once billing exists, and return whether there was one
  await deleteFolder(accountFolder(accountId)); // uploaded files
  for (const l of await labelModel.getAllForAccount(accountId)) await labelModel.remove(l.id, blameable);
  for (const t of await templateModel.getAllForAccount(accountId)) await templateModel.remove(t.id, blameable); // exports are under the account folder, deleted above
  for (const x of await submissionModel.getAllForAccount(accountId)) await submissionModel.remove(x.id, blameable); // their files are under the account folder too
  for (const f of await formModel.getAllForAccount(accountId)) await formModel.remove(f.id, blameable);

  // Its team is removed (and told), and it leaves any team it was on.
  await removeForClosedAccount(accountId);

  const sessions = await tokens().find({ refId: accountId, tokenType: tokenType.REFRESH }, { index: "gs2" });
  await Promise.all(sessions.map((t) => tokens().remove({ id: t.id })));

  // Stamped just before removal, so the audit trail credits the person (or staff) who closed it.
  if (blameable) {
    const staffNote = byStaff ? { lastStaffAction: { action: "account closed", reason, at: new Date().toISOString(), by: blameable.actionBy?.name || blameable.actionBy?.email || null } } : {};
    await accounts().update({ id: accountId }, { set: { updatedBy: blameable.actionBy, auditStreamId: blameable.auditStreamId, ...staffNote } });
  }
  await accounts().remove({ id: accountId });

  try {
    await sendEmail({ to: account.email, ...accountClosedEmail({ firstName: account.firstName, counts: preview.counts, hadPlan, byStaff }) });
  } catch (err) {
    console.error(JSON.stringify({ msg: "account closed email failed", accountId, error: String(err?.message || err) }));
  }
  console.log(JSON.stringify({ msg: "account closed", accountId, byStaff, hadPlan, counts: preview.counts }));
  return { closed: true };
};

export class AccountClosureJoiSchema {
  get close() {
    return { confirmEmail: Joi.string().trim().required() };
  }

  // Staff: the reason is recorded in the audit trail (the account row's last stamp).
  get staffClose() {
    return { id: Joi.string().required(), reason: Joi.string().trim().min(3).max(500).required() };
  }
}
