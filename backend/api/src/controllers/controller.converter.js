import { catchAsync } from "../middlewares/error.js";
import * as converterService from "../services/service.converter.js";

export class ConverterController {
  uploadUrl = catchAsync(async (req, res) => res.json(await converterService.createUpload(req.accountId, req.joiData)));
  start = catchAsync(async (req, res) => res.json(await converterService.start(req.accountId, req.joiData)));
  status = catchAsync(async (req, res) => res.json(await converterService.status(req.accountId, req.joiData)));
}
