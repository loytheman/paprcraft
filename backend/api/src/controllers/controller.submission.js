import { catchAsync } from "../middlewares/error.js";
import * as submissionService from "../services/service.submission.js";

// An account's own submissions (req.accountId).
export class SubmissionController {
  list = catchAsync(async (req, res) => res.json(await submissionService.listSubmissions(req.accountId, req.joiData)));
  get = catchAsync(async (req, res) => res.json(await submissionService.getSubmission(req.joiData.id, req.accountId)));
  create = catchAsync(async (req, res) => res.json(await submissionService.createSubmission(req.joiData, req.accountId, req.blameable)));
  save = catchAsync(async (req, res) => res.json(await submissionService.saveSubmission(req.joiData, req.accountId, req.blameable)));
  submit = catchAsync(async (req, res) => res.json(await submissionService.submit(req.joiData, req.accountId, req.blameable)));
  approve = catchAsync(async (req, res) => res.json(await submissionService.approve(req.joiData, req.accountId, req.blameable)));
  reject = catchAsync(async (req, res) => res.json(await submissionService.reject(req.joiData, req.accountId, req.blameable)));
  reopen = catchAsync(async (req, res) => res.json(await submissionService.reopen(req.joiData.id, req.accountId, req.blameable)));
  attachmentUrl = catchAsync(async (req, res) => res.json(await submissionService.attachmentUploadUrl(req.joiData, req.accountId)));
  createLink = catchAsync(async (req, res) => res.json(await submissionService.createLink(req.joiData, req.accountId, req.blameable)));
  revokeLink = catchAsync(async (req, res) => res.json(await submissionService.revokeLink(req.joiData.id, req.accountId, req.blameable)));
  remove = catchAsync(async (req, res) => {
    await submissionService.deleteSubmission(req.joiData.id, req.accountId, req.blameable);
    res.json({ message: "Submission deleted." });
  });
}

// A customer's link: no login, the token is the credential (rate limited in the routes).
export class PublicFormController {
  get = catchAsync(async (req, res) => res.json(await submissionService.getPublic(req.joiData.token)));
  save = catchAsync(async (req, res) => res.json(await submissionService.savePublic(req.joiData, req.blameable)));
  attachmentUrl = catchAsync(async (req, res) => res.json(await submissionService.publicUploadUrl(req.joiData)));
  submit = catchAsync(async (req, res) => res.json(await submissionService.submitPublic(req.joiData, req.clientInfo, req.blameable)));
}
