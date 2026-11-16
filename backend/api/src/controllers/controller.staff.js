import { catchAsync } from "../middlewares/error.js";
import * as staffService from "../services/service.staff.js";

// Paprcraft staff console. Every route is behind auth() + requireAdmin(); writes carry
// staffBehaviour (the audit trail marks them as staff actions). :id is the customer's account.
export class StaffController {
  list = catchAsync(async (req, res) => {
    res.json(await staffService.listCustomers(req.joiData));
  });

  get = catchAsync(async (req, res) => {
    res.json(await staffService.getCustomer(req.joiData.id));
  });

  complimentary = catchAsync(async (req, res) => {
    res.json(await staffService.setComplimentary(req.joiData.id, req.joiData, req.blameable));
  });

  limits = catchAsync(async (req, res) => {
    res.json(await staffService.setLimits(req.joiData.id, req.joiData, req.blameable));
  });

  status = catchAsync(async (req, res) => {
    res.json(await staffService.setStatus(req.joiData.id, req.joiData, req.blameable));
  });

  notes = catchAsync(async (req, res) => {
    res.json(await staffService.setNotes(req.joiData.id, req.joiData, req.blameable));
  });
}
