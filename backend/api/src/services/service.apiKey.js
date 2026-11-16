// API keys: `Authorization: Bearer pck_<accountId>_<secret>`. The secret is random, shown once,
// and only its SHA-256 is stored (models/model.apiKey.js). Used by middlewares/apiKeyAuth.js.
import crypto from "crypto";
import httpStatus from "http-status";
import apiKeyModel from "../models/model.apiKey.js";
import { ApiError, errorType } from "../middlewares/error.js";

const PREFIX = "pck_";
const hash = (secret) => crypto.createHash("sha256").update(secret).digest("hex");
const unauthorized = () => new ApiError(httpStatus.UNAUTHORIZED, errorType.MISSING_API_CREDENTIALS, "Invalid API key.");

// Makes (or replaces) the account's key. The token is returned once and never stored.
export const regenerateKey = async (accountId) => {
  const secret = crypto.randomBytes(24).toString("base64url");
  await apiKeyModel.put({ accountId, secretHash: hash(secret), prefix: secret.slice(0, 6), rotatedAt: new Date().toISOString() });
  return { token: `${PREFIX}${accountId}_${secret}`, prefix: secret.slice(0, 6) };
};

// What the dashboard shows: whether there is a key, never the key.
export const getKeyInfo = async (accountId) => {
  const k = await apiKeyModel.get(accountId);
  return k ? { exists: true, prefix: k.prefix, rotatedAt: k.rotatedAt ?? null } : { exists: false };
};

export const revokeKey = (accountId) => apiKeyModel.remove(accountId);

// Bearer header -> { accountId }. Throws 401 on anything wrong.
export const authenticate = async (authorization) => {
  const m = /^Bearer\s+pck_([0-9A-Za-z]+)_([\w-]+)$/.exec(String(authorization ?? "").trim());
  if (!m) throw unauthorized();
  const [, accountId, secret] = m;
  const k = await apiKeyModel.get(accountId);
  const a = Buffer.from(k?.secretHash ?? "");
  const b = Buffer.from(hash(secret));
  if (!k || a.length !== b.length || !crypto.timingSafeEqual(a, b)) throw unauthorized();
  return { accountId };
};
