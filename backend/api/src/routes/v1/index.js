import { Router } from "express";
import joi, { addDataFromClaim } from "../../middlewares/prepareJoi.js";
import { blameableBehaviour, keywordSearchBehaviour, staffBehaviour } from "../../middlewares/behaviour.js";
import { auth, requireOwner, authRefreshToken, requireAdmin } from "../../middlewares/auth.js";

import { AuthController } from "../../controllers/controller.auth.js";
import { AuthJoiSchema } from "../../services/service.auth.js";
import { AccountController } from "../../controllers/controller.account.js";
import { AccountJoiSchema } from "../../models/model.account.js";
import { ActivityController } from "../../controllers/controller.activity.js";
import { ActivityJoiSchema } from "../../models/model.activity.trail.js";
import { apiKeyAuth } from "../../middlewares/apiKeyAuth.js";
import { LabelController } from "../../controllers/controller.label.js";
import { LabelJoiSchema } from "../../models/model.label.js";
import { customJoi as Joi } from "../../models/customJoi.js";
import { TemplateController, MasterTemplateController } from "../../controllers/controller.template.js";
import { TemplateJoiSchema } from "../../models/model.template.js";
import { ApiKeyController } from "../../controllers/controller.apiKey.js";
import { AttachmentController } from "../../controllers/controller.attachment.js";
import { AttachmentJoiSchema } from "../../services/service.attachment.js";
import { StaffController } from "../../controllers/controller.staff.js";
import { AccountClosureController } from "../../controllers/controller.accountClosure.js";
import { TeamController } from "../../controllers/controller.team.js";
import { AccountMemberJoiSchema } from "../../models/model.accountMember.js";
import { AccountClosureJoiSchema } from "../../services/service.accountClosure.js";
import { StaffJoiSchema } from "../../services/service.staff.js";

export const router = Router();
const r = router;

{
  // Labels, scoped to the caller's own account (controller.label.js).
  const sl = new LabelJoiSchema();
  const cl = new LabelController();
  r.get("/labels", auth(), cl.getLabels)
  r.post("/label", auth(), joi(sl.createLabel), blameableBehaviour, cl.createLabel)
  r.put("/label/:id", auth(), joi(sl.updateLabel), blameableBehaviour, cl.updateLabel)
  r.delete("/label/:id", auth(), joi(sl.byId), blameableBehaviour, cl.deleteLabel)
}

{
  const s = new AuthJoiSchema();
  const c = new AuthController();
  r.post("/auth/login", joi(s.getLogin), c.login)
  r.get("/auth/google/start", joi(s.googleStart), c.googleStart)
  // No auth() — the browser arrives here via a cross-site redirect from Google, so our
  // SameSite=Strict cookies aren't sent; identity travels in the signed `state` param instead
  // (see service.accountAuth.js).
  r.get("/auth/google/callback", joi(s.googleCallback), c.googleCallback)
  r.post("/auth/refresh-token", authRefreshToken(), c.refreshToken)
  r.post("/auth/resume-login", authRefreshToken(), c.refreshToken)
  r.post("/auth/sign-out", authRefreshToken(), c.signOut)
}

{
  const s = new AccountJoiSchema();
  const c = new AccountController();
  r.post("/account", auth(), requireAdmin(), joi(s.createAccount), blameableBehaviour, c.createUserAccount)
  r.get("/accounts", auth(), requireAdmin(), joi(s.getAllAccounts), c.getAllAccounts)
  // Staff only: it used to be open, and returned the whole account row (password hash included).
  r.get("/account", auth(), requireAdmin(), joi(s.getAccountByEmail), c.getAccountByEmail)
  r.get("/account/search", auth(), requireAdmin(), joi(s.searchAccounts), c.searchAccounts)
  r.get("/account/:id", auth(), requireAdmin(), joi(s.getAccountById), c.getAccountById)
  r.put("/account/:id", auth(), requireAdmin(), joi(s.updateAccount), blameableBehaviour, c.updateAccount)
  r.put("/account/:id/reset-password", auth(), requireAdmin(), joi(s.adminResetPassword), blameableBehaviour, c.resetAccountPassword)
  r.delete("/account/:id", auth(), requireAdmin(), joi(s.deleteAccountById), blameableBehaviour, c.deleteAccountById)
}

{
  const s = new ActivityJoiSchema();
  const c = new ActivityController();
  r.get("/activity/account", auth(), joi(s.account), c.account)
  r.get("/activity", auth(), requireAdmin(), joi(s.staffList), c.staffList)
}

{
  // Paprcraft staff console (service.staff.js). requireAdmin() on every route.
  const s = new StaffJoiSchema();
  const c = new StaffController();
  r.get("/staff/customers", auth(), requireAdmin(), joi(s.list), c.list)
  r.get("/staff/customers/:id", auth(), requireAdmin(), joi(s.byId), c.get)
  r.put("/staff/customers/:id/complimentary", auth(), requireAdmin(), joi(s.complimentary), staffBehaviour, c.complimentary)
  r.put("/staff/customers/:id/limits", auth(), requireAdmin(), joi(s.limits), staffBehaviour, c.limits)
  r.put("/staff/customers/:id/status", auth(), requireAdmin(), joi(s.status), staffBehaviour, c.status)
  r.put("/staff/customers/:id/notes", auth(), requireAdmin(), joi(s.notes), staffBehaviour, c.notes)
}

{
  // Teams (service.team.js). The active account's team: anyone in it may look, the owner changes it.
  const s = new AccountMemberJoiSchema();
  const c = new TeamController();
  r.get("/team", auth(), c.getTeam)
  r.post("/team/invite", auth(), requireOwner(), joi(s.invite), blameableBehaviour, c.invite)
  r.post("/team/member/:id/resend", auth(), requireOwner(), joi(s.byId), c.resend)
  r.put("/team/member/:id", auth(), requireOwner(), joi(s.changeRole), blameableBehaviour, c.changeRole)
  r.delete("/team/member/:id", auth(), requireOwner(), joi(s.byId), blameableBehaviour, c.remove)
  // Personal: the accounts you're on the team of, leaving one, and invites.
  r.get("/team/memberships", auth({ personal: true }), c.memberships)
  r.post("/team/leave", auth({ personal: true }), joi(s.leave), blameableBehaviour, c.leave)
  r.get("/team/invite/:token", joi(s.token), c.inviteInfo)
  r.post("/team/invite/accept", auth({ personal: true }), joi(s.token), blameableBehaviour, c.accept)
}

{
  // Closing an account (service.accountClosure.js): your own, or a customer's by staff.
  const s = new AccountClosureJoiSchema();
  const c = new AccountClosureController();
  r.get("/account-closure", auth({ personal: true }), c.preview)
  r.post("/account-closure", auth({ personal: true }), joi(s.close), blameableBehaviour, c.closeMine)
  r.get("/staff/customers/:id/closure", auth(), requireAdmin(), joi(new StaffJoiSchema().byId), c.staffPreview)
  r.post("/staff/customers/:id/close", auth(), requireAdmin(), joi(s.staffClose), staffBehaviour, c.staffClose)
}

{
  // Closing the account: the owner's own (personal: not tied to an account switch), or staff's.
  const s = new AccountClosureJoiSchema();
  const c = new AccountClosureController();
  r.get("/account-closure", auth({ personal: true }), c.preview)
  r.post("/account-closure", auth({ personal: true }), joi(s.close), blameableBehaviour, c.closeMine)
  r.get("/staff/customers/:id/closure", auth(), requireAdmin(), joi(new StaffJoiSchema().byId), c.staffPreview)
  r.post("/staff/customers/:id/close", auth(), requireAdmin(), joi(s.staffClose), staffBehaviour, c.staffClose)
}

{
  // The caller's own account API key (owner only). The token is shown once, on regenerate.
  const c = new ApiKeyController();
  r.get("/api-key", auth(), requireOwner(), c.get)
  r.post("/api-key", auth(), requireOwner(), c.regenerate)
  r.delete("/api-key", auth(), requireOwner(), c.revoke)
  // Example of a route called with an API key instead of a login (middlewares/apiKeyAuth.js):
  // r.post("/events", apiKeyAuth(), joi(s.create), c.create)
}

{
  // Uploads: the browser PUTs straight to S3 with this URL, then saves its record with the key.
  const s = new AttachmentJoiSchema();
  const c = new AttachmentController();
  r.post("/attachment/upload-url", auth(), joi(s.uploadUrl), c.createUploadUrl)
}

{
  // Document templates (service.template.js). An account's own: any role may read, members edit
  // (viewers are refused by auth() on non-GET). Masters are staff-managed; accounts clone them.
  const s = new TemplateJoiSchema();
  const c = new TemplateController();
  r.get("/templates", auth(), c.list)
  r.get("/templates/search", auth(), joi(s.search), c.search)
  r.get("/template-masters", auth(), c.listMasters)
  r.post("/template/clone-master", auth(), joi(s.byId), blameableBehaviour, c.cloneMaster)
  r.post("/template", auth(), joi(s.create), blameableBehaviour, c.create)
  r.post("/template/generate", auth(), joi(s.generate), blameableBehaviour, c.generate)
  r.post("/template/:id/duplicate", auth(), joi(s.byId), blameableBehaviour, c.duplicate)
  r.get("/template/:id", auth(), joi(s.byId), c.get)
  r.put("/template/:id", auth(), joi(s.update), blameableBehaviour, c.update)
  r.delete("/template/:id/export/:cbId", auth(), joi(s.exportById), blameableBehaviour, c.deleteExport)
  r.delete("/template/:id", auth(), joi(s.byId), blameableBehaviour, c.remove)

  const m = new MasterTemplateController();
  r.get("/staff/master-templates", auth(), requireAdmin(), m.list)
  r.post("/staff/master-templates", auth(), requireAdmin(), joi(s.create), staffBehaviour, m.create)
  r.get("/staff/master-templates/:id", auth(), requireAdmin(), joi(s.byId), m.get)
  r.put("/staff/master-templates/:id", auth(), requireAdmin(), joi(s.update), staffBehaviour, m.update)
  r.delete("/staff/master-templates/:id", auth(), requireAdmin(), joi(s.byId), staffBehaviour, m.remove)
}
