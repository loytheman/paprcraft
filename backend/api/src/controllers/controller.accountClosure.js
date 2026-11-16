import { catchAsync } from "../middlewares/error.js";
import Constant from "../helpers/constant.js";
import * as closureService from "../services/service.accountClosure.js";

// Closing an account (service.accountClosure.js): the owner's own (Settings > Account), or a
// customer's by Paprcraft staff (staff console, :id).
export class AccountClosureController {
  preview = catchAsync(async (req, res) => {
    res.json(await closureService.getClosurePreview(req.userData.sub));
  });

  closeMine = catchAsync(async (req, res) => {
    await closureService.closeAccount(req.userData.sub, { confirmEmail: req.joiData.confirmEmail, blameable: req.blameable });
    res.clearCookie(Constant.COOKIE_REFRESH_TOKEN);
    res.clearCookie(Constant.COOKIE_ACCESS_TOKEN);
    res.json({ message: "Your account has been closed." });
  });

  staffPreview = catchAsync(async (req, res) => {
    res.json(await closureService.getClosurePreview(req.joiData.id));
  });

  staffClose = catchAsync(async (req, res) => {
    await closureService.closeAccount(req.joiData.id, { byStaff: true, reason: req.joiData.reason, blameable: req.blameable });
    res.json({ message: "The account has been closed." });
  });
}
