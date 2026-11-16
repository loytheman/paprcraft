import { catchAsync } from "../middlewares/error.js";
import auditTrailModel from "../models/model.activity.trail.js";

// Audit trail views. Who may see what:
//   GET /activity/account          the caller's account: every change, by anyone or System, and
//                                  sign-ins, with IP / device / city (?category= narrows it)
//   GET /activity                  Paprcraft staff: everything, or one account / user / record
// Rows are kept forever and every plan sees the full history.
const pagination = ({ nextKey, limit }) => ({ nextKey, limit });

// What the customer sees of staff work on their account: "Paprcraft support", not the staff
// member or where they were; and never the staff-only fields (internal notes, staff reasons).
const STAFF_ONLY_FIELDS = new Set(["internalNotes", "lastStaffAction", "billingAdminNote", "role"]);
const SUPPORT = { userId: null, name: "Paprcraft support", email: null, ip: null, device: null, location: null, staff: true };
// Team members and viewers see who changed what, but only the owner sees where they were.
const whoOnly = (actor) => (actor ? { ...actor, ip: null, device: null, location: null } : actor);
const forCustomer = (page, role = "owner") => ({
  ...page,
  results: page.results
    .map((r) => ({ ...r, actor: r.actor?.staff ? SUPPORT : role === "owner" ? r.actor : whoOnly(r.actor), userId: r.actor?.staff ? null : r.userId, changes: (r.changes ?? []).filter((c) => !STAFF_ONLY_FIELDS.has(c.field)) }))
    .filter((r) => !(r.action === "updated" && !r.changes.length)), // only staff-only fields changed
});

export class ActivityController {
  account = catchAsync(async (req, res) => {
    res.json(forCustomer(await auditTrailModel.pageForAccount(req.accountId, pagination(req.joiData), req.joiData.category), req.accountRole));
  });

  // For one of your own record types, add a route here that first checks the record belongs to
  // req.accountId, then: auditTrailModel.pageForRecord(`#TYPE:${id}`, pagination(req.joiData)).

  staffList = catchAsync(async (req, res) => {
    const { accountId, userId, refId } = req.joiData;
    const p = pagination(req.joiData);
    const result = accountId
      ? await auditTrailModel.pageForAccount(accountId, p)
      : userId
      ? await auditTrailModel.pageForUser(userId, p)
      : refId
      ? await auditTrailModel.pageForRecord(refId, p)
      : await auditTrailModel.pageAll(p);
    res.json(result);
  });
}
