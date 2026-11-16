import { catchAsync } from "../middlewares/error.js";
import * as formService from "../services/service.form.js";
import { MASTER_ACCOUNT_ID } from "../models/model.template.js";

// An account's own forms (req.accountId); the service answers 404 for anyone else's.
export class FormController {
  list = catchAsync(async (req, res) => res.json(await formService.listForms(req.accountId)));
  get = catchAsync(async (req, res) => res.json(await formService.getForm(req.joiData.id, req.accountId)));
  create = catchAsync(async (req, res) => res.json(await formService.createForm(req.joiData, req.accountId, req.blameable)));
  update = catchAsync(async (req, res) => res.json(await formService.updateForm(req.joiData, req.accountId, req.blameable)));
  publish = catchAsync(async (req, res) => res.json(await formService.publishForm(req.joiData.id, req.accountId, req.blameable)));
  unpublish = catchAsync(async (req, res) => res.json(await formService.unpublishForm(req.joiData.id, req.accountId, req.blameable)));
  duplicate = catchAsync(async (req, res) => res.json(await formService.cloneForm(req.joiData.id, req.accountId, req.accountId, req.blameable)));
  remove = catchAsync(async (req, res) => {
    await formService.deleteForm(req.joiData.id, req.accountId, req.blameable);
    res.json({ message: "Form deleted." });
  });

  // Masters, read-only for every account.
  listMasters = catchAsync(async (req, res) => res.json(await formService.listForms(MASTER_ACCOUNT_ID)));
  cloneMaster = catchAsync(async (req, res) => res.json(await formService.cloneForm(req.joiData.id, MASTER_ACCOUNT_ID, req.accountId, req.blameable)));
}

// Staff: the master forms themselves (routes under /staff, requireAdmin).
export class MasterFormController {
  list = catchAsync(async (req, res) => res.json(await formService.listForms(MASTER_ACCOUNT_ID)));
  get = catchAsync(async (req, res) => res.json(await formService.getForm(req.joiData.id, MASTER_ACCOUNT_ID)));
  create = catchAsync(async (req, res) => res.json(await formService.createForm(req.joiData, MASTER_ACCOUNT_ID, req.blameable)));
  update = catchAsync(async (req, res) => res.json(await formService.updateForm(req.joiData, MASTER_ACCOUNT_ID, req.blameable)));
  publish = catchAsync(async (req, res) => res.json(await formService.publishForm(req.joiData.id, MASTER_ACCOUNT_ID, req.blameable)));
  unpublish = catchAsync(async (req, res) => res.json(await formService.unpublishForm(req.joiData.id, MASTER_ACCOUNT_ID, req.blameable)));
  remove = catchAsync(async (req, res) => {
    await formService.deleteForm(req.joiData.id, MASTER_ACCOUNT_ID, req.blameable);
    res.json({ message: "Form deleted." });
  });
}
