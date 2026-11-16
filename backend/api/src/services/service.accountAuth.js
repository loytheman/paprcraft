import jwt from "jsonwebtoken";
import { OAuth2Client } from "google-auth-library";
import config from "../config/config.js";
import { createJwt } from "../helpers/jwt.js";
import * as accountService from "./service.account.js";
import { accountRoleType } from "../models/model.account.js";
import { ApiError, errorType } from "../middlewares/error.js";
import httpStatus from "http-status";

// "Sign in with Google" for logging into Paprcraft. This flow runs for an anonymous visitor and
// finds-or-creates their Account. The callback can't rely on any cookie surviving the round trip
// through accounts.google.com, so identity/CSRF protection travels in a signed JWT `state` param
// instead.
const OAUTH_STATE_AUDIENCE = "paprcraft-account-oauth-state";
const OAUTH_STATE_EXPIRY_SECONDS = 600;

const getRedirectUri = () => {
  // Must exactly match an authorized redirect URI on the Google Cloud OAuth client — add
  // https://localhost:<PORT>/v1/auth/google/callback there before this branch will work.
  if (config.stageEnv === "local") return `https://localhost:${config.port}/v1/auth/google/callback`;
  const host = config.stageEnv === "prod" ? "api.paprcraft.com" : "api-stg.paprcraft.com";
  return `https://${host}/v1/auth/google/callback`;
};

// Where customers open a form link (frontend/public-form).
export const getFormsUrl = () => {
  if (config.stageEnv === "local") return "https://localhost:6300";
  return `https://${config.stageEnv === "prod" ? "forms.paprcraft.com" : "forms-stg.paprcraft.com"}`;
};

// Where to send the browser once sign-in completes.
export const getFrontendUrl = () => {
  // frontend/dashboard's local dev server — HTTPS, matching this server (see its vite.config.js).
  if (config.stageEnv === "local") return "https://localhost:6100";
  const host = config.stageEnv === "prod" ? "dashboard.paprcraft.com" : "dashboard-stg.paprcraft.com";
  return `https://${host}`;
};

const getClient = () => new OAuth2Client(config.google.clientId, config.google.clientSecret, getRedirectUri());

export const getGoogleAuthUrl = (organizationId) => {
  const state = createJwt({ organizationId }, OAUTH_STATE_EXPIRY_SECONDS, OAUTH_STATE_AUDIENCE);
  // profile (not just openid+email) so we can seed firstName/lastName on a brand-new account.
  return getClient().generateAuthUrl({ scope: ["openid", "email", "profile"], state, prompt: "consent" });
};

export const handleGoogleCallback = async (code, state) => {
  let claims;
  try {
    claims = jwt.verify(state, config.jwt.userSecret, { audience: OAUTH_STATE_AUDIENCE });
  } catch {
    throw new ApiError(httpStatus.BAD_REQUEST, errorType.BAD_REQUEST, "This link has expired or is invalid — try signing in again.");
  }

  const client = getClient();
  const { tokens } = await client.getToken(code);
  const ticket = await client.verifyIdToken({ idToken: tokens.id_token, audience: config.google.clientId });
  const payload = ticket.getPayload();

  let account = await accountService.getAccountByEmail(payload.email);
  if (!account) {
    account = await accountService.createUserAccount({
      email: payload.email,
      firstName: payload.given_name,
      lastName: payload.family_name,
      emailVerified: true,
      role: accountRoleType.USER,
      organizationId: claims.organizationId,
    });
  }

  return account;
};
