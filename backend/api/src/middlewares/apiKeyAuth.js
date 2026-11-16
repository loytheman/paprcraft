import { catchAsync } from "./error.js";
import { authenticate } from "../services/service.apiKey.js";

// An account's API key in `Authorization: Bearer pck_...`. Sets req.accountId.
export const apiKeyAuth = () => catchAsync(async (req, res, next) => {
  req.accountId = (await authenticate(req.headers?.authorization)).accountId;
  next();
});
