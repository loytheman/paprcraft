import { catchAsync } from "../middlewares/error.js";
import * as valueSetService from "../services/service.valueSet.js";

// Value sets of the signed-in account (req.accountId); the service answers 404 for another account's.
export class ValueSetController {
  list = catchAsync(async (req, res) => {
    const sets = await valueSetService.listValueSets(req.accountId);
    res.json(sets);
  });

  create = catchAsync(async (req, res) => {
    const set = await valueSetService.createValueSet(req.joiData, req.accountId, req.blameable);
    res.json(set);
  });

  update = catchAsync(async (req, res) => {
    const set = await valueSetService.updateValueSet(req.joiData, req.accountId, req.blameable);
    res.json(set);
  });

  remove = catchAsync(async (req, res) => {
    await valueSetService.deleteValueSet(req.joiData.id, req.accountId, req.blameable);
    res.json({ message: "Data source deleted." });
  });
}
