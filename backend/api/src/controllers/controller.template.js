import { catchAsync } from "../middlewares/error.js";
import * as templateService from "../services/service.template.js";
import { MASTER_ACCOUNT_ID } from "../models/model.template.js";

// An account's own templates (req.accountId); the service answers 404 for anyone else's.
export class TemplateController {
  list = catchAsync(async (req, res) => {
    res.json(await templateService.listTemplates(req.accountId));
  });

  search = catchAsync(async (req, res) => {
    res.json(await templateService.searchTemplates(req.accountId, req.joiData.keyword));
  });

  get = catchAsync(async (req, res) => {
    res.json(await templateService.getTemplate(req.joiData.id, req.accountId));
  });

  create = catchAsync(async (req, res) => {
    res.json(await templateService.createTemplate(req.joiData, req.accountId, req.blameable));
  });

  update = catchAsync(async (req, res) => {
    res.json(await templateService.updateTemplate(req.joiData, req.accountId, req.blameable));
  });

  remove = catchAsync(async (req, res) => {
    await templateService.deleteTemplate(req.joiData.id, req.accountId, req.blameable);
    res.json({ message: "Template deleted." });
  });

  duplicate = catchAsync(async (req, res) => {
    res.json(await templateService.cloneTemplate(req.joiData.id, req.accountId, req.accountId, req.blameable));
  });

  generate = catchAsync(async (req, res) => {
    res.json(await templateService.generateExport(req.joiData, req.accountId, req.blameable));
  });

  deleteExport = catchAsync(async (req, res) => {
    res.json(await templateService.deleteExport(req.joiData.id, req.joiData.cbId, req.accountId, req.blameable));
  });

  // Masters, read-only for every account.
  listMasters = catchAsync(async (req, res) => {
    res.json(await templateService.listTemplates(MASTER_ACCOUNT_ID));
  });

  cloneMaster = catchAsync(async (req, res) => {
    res.json(await templateService.cloneTemplate(req.joiData.id, MASTER_ACCOUNT_ID, req.accountId, req.blameable));
  });
}

// Staff: the masters themselves (routes under /staff, requireAdmin).
export class MasterTemplateController {
  list = catchAsync(async (req, res) => {
    res.json(await templateService.listTemplates(MASTER_ACCOUNT_ID));
  });

  get = catchAsync(async (req, res) => {
    res.json(await templateService.getTemplate(req.joiData.id, MASTER_ACCOUNT_ID));
  });

  create = catchAsync(async (req, res) => {
    res.json(await templateService.createTemplate(req.joiData, MASTER_ACCOUNT_ID, req.blameable));
  });

  update = catchAsync(async (req, res) => {
    res.json(await templateService.updateTemplate(req.joiData, MASTER_ACCOUNT_ID, req.blameable));
  });

  remove = catchAsync(async (req, res) => {
    await templateService.deleteTemplate(req.joiData.id, MASTER_ACCOUNT_ID, req.blameable);
    res.json({ message: "Template deleted." });
  });
}
