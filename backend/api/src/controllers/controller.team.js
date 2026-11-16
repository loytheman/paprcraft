import { catchAsync } from "../middlewares/error.js";
import * as teamService from "../services/service.team.js";

// Teams (service.team.js). The team of the active account (req.accountId): anyone in it may look;
// changing it is owner-only (routes). Personal routes use the signed-in person (req.userData.sub).
export class TeamController {
  getTeam = catchAsync(async (req, res) => res.json(await teamService.getTeam(req.accountId)));
  invite = catchAsync(async (req, res) => res.json(await teamService.invite(req.accountId, req.joiData, req.blameable)));
  resend = catchAsync(async (req, res) => res.json(await teamService.resendInvite(req.accountId, req.joiData.id)));
  changeRole = catchAsync(async (req, res) => res.json(await teamService.changeRole(req.accountId, req.joiData, req.blameable)));
  remove = catchAsync(async (req, res) => res.json(await teamService.remove(req.accountId, req.joiData.id, req.blameable)));

  memberships = catchAsync(async (req, res) => res.json(await teamService.getMemberships(req.userData.sub)));
  leave = catchAsync(async (req, res) => {
    await teamService.leave(req.userData.sub, req.joiData.accountId, req.blameable);
    res.json({ left: true });
  });
  inviteInfo = catchAsync(async (req, res) => res.json(await teamService.getInviteInfo(req.joiData.token)));
  accept = catchAsync(async (req, res) => res.json(await teamService.acceptInvite(req.userData.sub, req.joiData.token, req.blameable)));
}
