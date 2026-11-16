import { catchAsync } from "../middlewares/error.js";
import * as apiKeyService from "../services/service.apiKey.js";

// The caller's own account API key (owner only, see routes).
export class ApiKeyController {
  get = catchAsync(async (req, res) => {
    res.json(await apiKeyService.getKeyInfo(req.accountId));
  });

  regenerate = catchAsync(async (req, res) => {
    res.json(await apiKeyService.regenerateKey(req.accountId));
  });

  revoke = catchAsync(async (req, res) => {
    await apiKeyService.revokeKey(req.accountId);
    res.json({ revoked: true });
  });
}
