import * as accountService from "./service.account.js";
import * as tokenService from "./service.token.js";
import Utils from "../helpers/utils.js";
import { createJwt } from "../helpers/jwt.js";
import Constant from "../helpers/constant.js";
import { tokenType } from "../models/model.token.js";
import { customJoi as Joi } from "../models/customJoi.js";
import httpStatus from "http-status";
import { ApiError, errorType } from "../middlewares/error.js";
import { SUSPENDED_MESSAGE } from "./service.plan.js";

export class AuthJoiSchema {

  get getLogin() {
    return {
      email: Joi.string().lowercase().min(1).required(),
      password: Joi.string().min(1).required(),
      // cloudflareTurnstileToken: Joi.string().required().messages({ "any.required": "Captcha token is required" }),
    };
  }

  get getLoginPreVerified() {
    return {
      email: Joi.string().lowercase().min(1).required(),
      password: Joi.string().min(1).required(),
      preVerifiedToken: Joi.string().required().messages({ "any.required": "Pre-verified token is required" }),
    };
  }

  // get getRefreshToken() {
  //   return {
  //     refreshToken: Joi.string().required(),
  //   };
  // }

  get googleStart() {
    return {
      organizationId: Joi.string(),
    };
  }

  get googleCallback() {
    return {
      // code is absent when the user cancels/denies on Google's consent screen rather than
      // completing it — not required, so the controller can redirect back with a toast instead
      // of this failing validation before the controller even runs.
      code: Joi.string(),
      state: Joi.string().required(),
    };
  }

}

export const getByEmailAndPassword = async (email, password) => {
  const account = await accountService.getAccountByEmail(email);
  console.log("account", account)
  if (!account) return null;

  const accountWithHash = await accountService.getAccountById(account.id, true);
  console.log("accountWithHash", accountWithHash)
  if (!accountWithHash) return null;

  const isValid = Utils.comparePassword(password, accountWithHash.passwordHash);
  if (!isValid) return null;

  return account;
};

export const getAccountById = async (id) => accountService.getAccountById(id);

// signIn: { clientInfo: req.clientInfo, method: "password" | "google" | "invite" } — recorded in the audit trail.
export const recordSuccessfulSignIn = async (id, signIn = {}) => accountService.updateSignedInAt(id, signIn);

// Every sign-in path and every token refresh comes through here, so a suspended account
// (service.staff.js) can't get new tokens; suspending also deletes its refresh tokens.
export const createTokenSetForUserLogin = async (account) => {
  if (account?.accountStatus === "suspended") throw new ApiError(httpStatus.FORBIDDEN, errorType.ACCOUNT_SUSPENDED, SUSPENDED_MESSAGE);
  const accessClaims = {
    sub: account.id,
    orgId: account.organizationId,
    name: `${account.firstName ?? ""} ${account.lastName ?? ""}`.trim() || null,
    accountStatus: account.accountStatus,
    role: account.role,
  };

  const idClaims = {
    sub: account.id,
    orgId: account.organizationId,
    email: account.email,
    firstName: account.firstName,
    lastName: account.lastName,
    salutation: account.salutation,
    dob: account.dob,
    mobile: account.mobile,
    mobileCountryCode: account.mobileCountryCode,
    mobileFull: account.mobileFull,
    emailVerified: account.emailVerified,
    mobileVerified: account.mobileVerified,
    accountStatus: account.accountStatus,
    role: account.role,
  };

  const accessToken = createJwt(accessClaims, Constant.ACCESS_TOKEN_EXPIRY);
  const idToken = createJwt(idClaims, Constant.ID_TOKEN_EXPIRY);
  const refreshToken = Utils.generateToken();

  await tokenService.createToken(tokenType.REFRESH, refreshToken, account.id, Constant.REFRESH_TOKEN_EXPIRY);

  return { accessToken, idToken, refreshToken };
};
