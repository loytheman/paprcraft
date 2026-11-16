import { catchAsync } from "../middlewares/error.js";
import * as attachmentService from "../services/service.attachment.js";

export class AttachmentController {
  // The browser uploads here first, then saves its record with the returned key.
  createUploadUrl = catchAsync(async (req, res) => {
    res.json(await attachmentService.createUploadUrl(req.accountId, req.joiData));
  });
}
