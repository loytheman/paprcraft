// Team members of an Paprcraft account (Pro only; service.team.js). The owner is the account
// itself and has no row here; each row is someone else who may work in the account, or a pending
// invite:
//   status "invited": invitedEmail set, userId not yet; the invite token (model.token.js,
//                     INVITATION_TOKEN, refId = this id) is emailed.
//   status "active":  userId set once they accepted by signing in with Google as invitedEmail.
// role: "member" (everything except billing and the team) | "viewer" (read-only).
// Indexes: gs0 = an account's team; gs1 = one person's memberships (once accepted); gs2 = invites
// by email.
import { customJoi as Joi } from "./customJoi.js";

export const memberRoles = ["member", "viewer"];
export const memberStatus = { INVITED: "invited", ACTIVE: "active" };

let memberModel;
(async () => {
  const m = await import("../services/index.js");
  memberModel = m.getOneTable().getModel("AccountMember");
})();

export const accountMemberSchema = {
  pk: { type: String, value: "#MEMBER:${id}" },
  sk: { type: String, value: "#MEMBER#METADATA" },
  gs0pk: { type: String, value: "#ACCOUNT:${accountId}#MEMBERS" },
  gs0sk: { type: String, value: "#MEMBER:${id}" },
  gs1pk: { type: String, value: "#USER:${userId}#MEMBERSHIPS" },
  gs1sk: { type: String, value: "#ACCOUNT:${accountId}" },
  gs2pk: { type: String, value: "#MEMBER#EMAIL:${invitedEmail}" },
  gs2sk: { type: String, value: "#ACCOUNT:${accountId}" },

  id: { type: String, generate: "ulid" },
  accountId: { type: String, required: true }, // the account (= its owner's id)
  userId: { type: String }, // the member's own account id, once accepted
  invitedEmail: { type: String, required: true }, // lowercased
  role: { type: String, required: true, enum: memberRoles },
  status: { type: String, required: true, enum: Object.values(memberStatus) },
  invitedBy: { type: Object }, // { userId, name, email }
  invitedAt: { type: String },
  joinedAt: { type: String },
  createdBy: { type: Object },
  updatedBy: { type: Object },
  auditStreamId: { type: String },
};

const stamp = (blameable) => (blameable ? { updatedBy: blameable.actionBy, auditStreamId: blameable.auditStreamId } : {});

export default {
  create: (data, blameable = null) =>
    memberModel.create({ ...data, ...(blameable && { createdBy: blameable.actionBy, auditStreamId: blameable.auditStreamId }) }),
  get: (id) => memberModel.get({ id }),
  update: (data, blameable = null) => memberModel.update({ ...data, ...stamp(blameable) }, { exists: true }),
  remove: async (id, blameable = null) => {
    if (blameable) await memberModel.update({ id, ...stamp(blameable) }, { exists: null });
    return memberModel.remove({ id });
  },
  // An account's team (members and pending invites).
  getForAccount: (accountId) => memberModel.find({ accountId }, { index: "gs0", limit: 100 }),
  // One person's accepted memberships, and their membership of one account.
  getForUser: (userId) => memberModel.find({ userId }, { index: "gs1", limit: 100 }),
  getForUserAndAccount: async (userId, accountId) =>
    (await memberModel.find({ userId, gs1sk: `#ACCOUNT:${accountId}` }, { index: "gs1", limit: 1 }))[0] ?? null,
  // Pending invites to an email address (any account).
  getInvitesForEmail: (invitedEmail) => memberModel.find({ invitedEmail }, { index: "gs2", limit: 100 }),
};

export class AccountMemberJoiSchema {
  get invite() {
    return { email: Joi.string().trim().lowercase().max(254).email({ tlds: false }).required().label("Email address"), role: Joi.valid(...memberRoles).required().label("Role") };
  }

  get byId() {
    return { id: Joi.string().required() };
  }

  get changeRole() {
    return { id: Joi.string().required(), role: Joi.valid(...memberRoles).required().label("Role") };
  }

  get token() {
    return { token: Joi.string().trim().max(200).required() };
  }

  get leave() {
    return { accountId: Joi.string().required() };
  }
}
