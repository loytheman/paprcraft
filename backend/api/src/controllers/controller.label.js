import { catchAsync } from "../middlewares/error.js";
import * as labelService from "../services/service.label.js";

// Labels of the signed-in account (req.accountId); the service answers 404 for another account's.
export class LabelController {
  getLabels = catchAsync(async (req, res) => {
    res.json(await labelService.listLabels(req.accountId));
  });

  createLabel = catchAsync(async (req, res) => {
    res.json(await labelService.createLabel(req.joiData, req.accountId, req.blameable));
  });

  updateLabel = catchAsync(async (req, res) => {
    res.json(await labelService.updateLabel(req.joiData, req.accountId, req.blameable));
  });

  deleteLabel = catchAsync(async (req, res) => {
    await labelService.deleteLabel(req.joiData.id, req.accountId, req.blameable);
    res.json({ message: "Label deleted." });
  });
}
