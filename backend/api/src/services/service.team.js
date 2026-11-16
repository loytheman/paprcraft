// Teams (Pro only): other people working in an Paprcraft account, as Member (everything except
// billing and the team) or Viewer (read-only). Who may do what per request is checked in
// middlewares/auth.js (resolveActiveAccount, requireOwner); this is the team itself.
//   Seats: the plan's teamLimit counts everyone, the owner included (Pro: 5), and pending invites.
//   Inviting: by email; the invite link (7 days) is accepted by signing in with Google as that
//   same email. Re-sending makes a new link.
//   Leaving Pro: memberships stay but give no access (auth.js) until the account is on Pro again;
//   members are emailed both ways (onTeamPlanChange, from service.billing.js).
//   Closing an account: its team is removed (and told); a member closing their own account leaves
//   every team (removeForClosedAccount, from service.accountClosure.js).
// Built from a membership row (model.accountMember.js), the single-use token store
// (model.token.js) and an invite-by-email flow.
import httpStatus from "http-status";
import crypto from "crypto";
import { getOneTable } from "./index.js";
import { ApiError, errorType } from "../middlewares/error.js";
import { forgetAccess } from "../middlewares/auth.js";
import memberModel, { memberStatus } from "../models/model.accountMember.js";
import { tokenType } from "../models/model.token.js";
import * as tokenService from "./service.token.js";
import { getAccountPlan, planLimitError } from "./service.plan.js";
import { sendEmail } from "./service.email.js";
import { getFrontendUrl } from "./service.accountAuth.js";
import { teamInviteEmail, teamRemovedEmail, teamAccessEmail } from "../emails/email.team.js";

const INVITE_EXPIRY_SECONDS = 7 * 24 * 60 * 60;
const accounts = () => getOneTable().getModel("Account");
const tokens = () => getOneTable().getModel("Token");

const badRequest = (msg) => new ApiError(httpStatus.BAD_REQUEST, errorType.BAD_REQUEST, msg);
const notFound = (msg = "That team member no longer exists.") => new ApiError(httpStatus.NOT_FOUND, errorType.NOT_FOUND, msg);
const nameOf = (a) => [a?.firstName, a?.lastName].filter(Boolean).join(" ") || a?.email || "an Paprcraft user";
const sameEmail = (a, b) => String(a ?? "").trim().toLowerCase() === String(b ?? "").trim().toLowerCase();

const notify = async (to, email) => {
  try {
    await sendEmail({ to, ...email });
  } catch (err) {
    console.error(JSON.stringify({ msg: "team email failed", error: String(err?.message || err) }));
  }
};

const memberOfAccount = async (id, accountId) => {
  const m = await memberModel.get(id);
  if (!m || m.accountId !== accountId) throw notFound();
  return m;
};

// Every invite token for a membership (re-sending replaces them).
const dropInviteTokens = async (memberId) => {
  const list = await tokens().find({ refId: memberId, tokenType: tokenType.TEAM_INVITE }, { index: "gs2" });
  await Promise.all(list.map((t) => tokens().remove({ id: t.id })));
};

const sendInvite = async (member, owner, inviterName) => {
  await dropInviteTokens(member.id);
  const token = crypto.randomBytes(32).toString("base64url");
  await tokenService.createToken(tokenType.TEAM_INVITE, token, member.id, INVITE_EXPIRY_SECONDS);
  const inviteUrl = `${getFrontendUrl()}/invite?token=${encodeURIComponent(token)}`;
  await notify(member.invitedEmail, teamInviteEmail({ accountName: nameOf(owner), inviterName, role: member.role, inviteUrl }));
};

const publicMember = (m, usersById = {}) => {
  const u = m.userId ? usersById[m.userId] : null;
  return {
    id: m.id,
    status: m.status,
    role: m.role,
    email: u?.email ?? m.invitedEmail,
    name: u ? nameOf(u) : null,
    invitedAt: m.invitedAt ?? null,
    joinedAt: m.joinedAt ?? null,
  };
};

// ---- The team (anyone in the account may look; changing it is owner-only) ------------------

export const getTeam = async (accountId) => {
  const [owner, rows, plan] = await Promise.all([accounts().get({ id: accountId }), memberModel.getForAccount(accountId), getAccountPlan(accountId)]);
  const users = await Promise.all(rows.filter((m) => m.userId).map((m) => accounts().get({ id: m.userId })));
  const usersById = Object.fromEntries(users.filter(Boolean).map((u) => [u.id, u]));
  return {
    owner: { id: accountId, name: nameOf(owner), email: owner?.email ?? null },
    members: rows.sort((a, b) => a.id.localeCompare(b.id)).map((m) => publicMember(m, usersById)),
    seats: { used: 1 + rows.length, limit: plan.teamLimit },
    available: plan.teamLimit > 1, // Pro
  };
};

export const invite = async (accountId, { email, role }, blameable) => {
  const plan = await getAccountPlan(accountId);
  if (plan.teamLimit <= 1) throw planLimitError("Team members are on the Pro plan. Upgrade to invite people to your account.");
  const [owner, rows] = await Promise.all([accounts().get({ id: accountId }), memberModel.getForAccount(accountId)]);
  if (sameEmail(owner?.email, email)) throw badRequest("That's your own email address.");
  if (rows.some((m) => sameEmail(m.invitedEmail, email))) throw badRequest("That person is already on the team, or has an invite waiting.");
  if (1 + rows.length >= plan.teamLimit) throw planLimitError(`Your plan includes ${plan.teamLimit} people, you included. Remove someone or cancel an invite first.`);
  const member = await memberModel.create(
    { accountId, invitedEmail: email.trim().toLowerCase(), role, status: memberStatus.INVITED, invitedBy: blameable?.actionBy ?? null, invitedAt: new Date().toISOString() },
    blameable,
  );
  await sendInvite(member, owner, nameOf(owner));
  return getTeam(accountId);
};

export const resendInvite = async (accountId, id) => {
  const m = await memberOfAccount(id, accountId);
  if (m.status !== memberStatus.INVITED) throw badRequest("They've already joined.");
  const owner = await accounts().get({ id: accountId });
  await sendInvite(m, owner, nameOf(owner));
  return getTeam(accountId);
};

export const changeRole = async (accountId, { id, role }, blameable) => {
  const m = await memberOfAccount(id, accountId);
  await memberModel.update({ id: m.id, role }, blameable);
  if (m.userId) forgetAccess(m.userId, accountId);
  return getTeam(accountId);
};

// Cancel an invite, or remove someone (who is told).
export const remove = async (accountId, id, blameable) => {
  const m = await memberOfAccount(id, accountId);
  await dropInviteTokens(m.id);
  await memberModel.remove(m.id, blameable);
  if (m.userId) {
    forgetAccess(m.userId, accountId);
    const owner = await accounts().get({ id: accountId });
    await notify(m.invitedEmail, teamRemovedEmail({ accountName: nameOf(owner) }));
  }
  return getTeam(accountId);
};

// ---- Your own memberships (personal: the signed-in person, whatever account is active) -------

// For the account switcher: your own account, and the ones you're on the team of.
export const getMemberships = async (userId) => {
  const rows = (await memberModel.getForUser(userId)).filter((m) => m.status === memberStatus.ACTIVE);
  const owners = await Promise.all(rows.map((m) => accounts().get({ id: m.accountId })));
  const plans = await Promise.all(rows.map((m) => getAccountPlan(m.accountId)));
  return rows
    .map((m, i) => ({ accountId: m.accountId, name: nameOf(owners[i]), email: owners[i]?.email ?? null, role: m.role, available: plans[i].teamLimit > 1 && !plans[i].suspended }))
    .filter((x) => x.email); // the account still exists
};

// For the staff console: every account someone is on the team of, including invites to their email
// and memberships that are paused (owner not on Pro).
export const getStaffMemberships = async (userId) => {
  const me = await accounts().get({ id: userId });
  const [joined, invited] = await Promise.all([memberModel.getForUser(userId), me?.email ? memberModel.getInvitesForEmail(me.email.toLowerCase()) : []]);
  const rows = [...joined, ...invited.filter((m) => m.status === memberStatus.INVITED)];
  const owners = await Promise.all(rows.map((m) => accounts().get({ id: m.accountId })));
  const plans = await Promise.all(rows.map((m) => getAccountPlan(m.accountId)));
  return rows.map((m, i) => ({
    accountId: m.accountId, name: nameOf(owners[i]), email: owners[i]?.email ?? null, role: m.role, status: m.status,
    available: plans[i].teamLimit > 1 && !plans[i].suspended, joinedAt: m.joinedAt ?? null, invitedAt: m.invitedAt ?? null,
  }));
};

export const leave = async (userId, accountId, blameable) => {
  const m = await memberModel.getForUserAndAccount(userId, accountId);
  if (!m) throw notFound("You're not on that account's team.");
  await memberModel.remove(m.id, blameable);
  forgetAccess(userId, accountId);
};

// ---- Invites ---------------------------------------------------------------------------------

const resolveInvite = async (token) => {
  const t = await tokenService.getByToken(tokenType.TEAM_INVITE, token);
  const m = t ? await memberModel.get(t.refId) : null;
  if (!m || m.status !== memberStatus.INVITED) throw notFound("This invite has expired or was cancelled. Ask for a new one.");
  return m;
};

// The invite page (no sign-in needed): whose account, which role, for which email.
export const getInviteInfo = async (token) => {
  const m = await resolveInvite(token);
  const owner = await accounts().get({ id: m.accountId });
  return { accountName: nameOf(owner), role: m.role, invitedEmail: m.invitedEmail };
};

// Accepting, signed in (with Google): only as the email the invite was sent to.
export const acceptInvite = async (userId, token, blameable) => {
  const m = await resolveInvite(token);
  const me = await accounts().get({ id: userId });
  if (!sameEmail(me?.email, m.invitedEmail)) {
    throw new ApiError(httpStatus.FORBIDDEN, errorType.NO_PERMISSION, `This invite is for ${m.invitedEmail}. Sign in with Google as that address to accept it.`);
  }
  if (m.accountId === userId) throw badRequest("That's your own account.");
  if (await memberModel.getForUserAndAccount(userId, m.accountId)) throw badRequest("You're already on this team.");
  const plan = await getAccountPlan(m.accountId);
  if (plan.teamLimit <= 1) throw badRequest("This account isn't on Pro any more, so it can't add team members. Ask the owner.");
  await memberModel.update({ id: m.id, userId, status: memberStatus.ACTIVE, joinedAt: new Date().toISOString() }, blameable);
  await dropInviteTokens(m.id);
  forgetAccess(userId, m.accountId);
  const owner = await accounts().get({ id: m.accountId });
  return { accountId: m.accountId, name: nameOf(owner), role: m.role };
};

// ---- Plan changes and closed accounts --------------------------------------------------------

// From service.billing.js when an account's plan changes: tell the team if they lost or regained
// access (teams need Pro). The memberships themselves stay.
export const onTeamPlanChange = async (accountId, beforeTeamLimit, afterTeamLimit) => {
  const lost = beforeTeamLimit > 1 && afterTeamLimit <= 1;
  const regained = beforeTeamLimit <= 1 && afterTeamLimit > 1;
  if (!lost && !regained) return;
  const rows = (await memberModel.getForAccount(accountId)).filter((m) => m.status === memberStatus.ACTIVE);
  if (!rows.length) return;
  const owner = await accounts().get({ id: accountId });
  for (const m of rows) {
    forgetAccess(m.userId, accountId);
    await notify(m.invitedEmail, teamAccessEmail({ accountName: nameOf(owner), paused: lost, dashboardUrl: getFrontendUrl() }));
  }
};

// An account is being closed: remove its team (telling those who joined), and its own place on
// other teams.
export const removeForClosedAccount = async (accountId) => {
  const owner = await accounts().get({ id: accountId });
  for (const m of await memberModel.getForAccount(accountId)) {
    await dropInviteTokens(m.id);
    await memberModel.remove(m.id);
    if (m.userId) {
      forgetAccess(m.userId, accountId);
      await notify(m.invitedEmail, teamRemovedEmail({ accountName: nameOf(owner) }));
    }
  }
  for (const m of await memberModel.getForUser(accountId)) {
    await memberModel.remove(m.id);
    forgetAccess(accountId, m.accountId);
  }
};
