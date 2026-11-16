import httpStatus from "http-status";
import { ApiError, catchAsync, errorType, errorMessage } from "../middlewares/error.js";
import * as authService from "../services/service.auth.js";
import * as accountAuthService from "../services/service.accountAuth.js";
import * as tokenService from "../services/service.token.js";
import Constant from "../helpers/constant.js";
import { tokenType } from "../models/model.token.js";
import { createJwt } from "../helpers/jwt.js";
import config from "../config/config.js";
import Utils from "../helpers/utils.js";
import _ from "lodash";

const cookieOpts = { secure: true, httpOnly: true, sameSite: "Strict" };

export class AuthController {

  login = catchAsync(async (req, res) => {
    const { email, password, cdata } = req.joiData;
    const account = await authService.getByEmailAndPassword(email, password);
    if (!account) {
      throw new ApiError(httpStatus.UNAUTHORIZED, errorType.INVALID_CREDENTIALS, errorMessage.INVALID_CREDENTIALS);
    }
    // Tokens first: a suspended account is refused there, and that isn't a sign-in.
    var ts = await authService.createTokenSetForUserLogin(account);
    await authService.recordSuccessfulSignIn(account.id, { clientInfo: req.clientInfo, method: "password", account });
    res.cookie(Constant.COOKIE_REFRESH_TOKEN, ts.refreshToken, cookieOpts);
    res.cookie(Constant.COOKIE_ACCESS_TOKEN, ts.accessToken, cookieOpts);

    if (cdata != null) {
      const pvt = Utils.generateToken();
      await tokenService.createToken(tokenType.PRE_VERIFIED_TOKEN, pvt, cdata, Constant.PRE_VERIFIED_TOKEN_EXPIRY);
      ts = { ...ts, preVerifiedToken: pvt };
    }

    res.json(ts);
  });


  refreshToken = catchAsync(async (req, res) => {
    const rt = req.joiData.refreshToken;
    const tokenModel = await tokenService.getByToken(tokenType.REFRESH, rt);
    if (!tokenModel) {
      throw new ApiError(httpStatus.UNAUTHORIZED, errorType.INVALID_CREDENTIALS, errorMessage.INVALID_CREDENTIALS);
    }
    await tokenService.removeByToken(tokenType.REFRESH, rt);
    const account = await authService.getAccountById(tokenModel.refId);
    if (!account) {
      throw new ApiError(httpStatus.UNAUTHORIZED, errorType.INVALID_CREDENTIALS, errorMessage.INVALID_CREDENTIALS);
    }
    const ts = await authService.createTokenSetForUserLogin(account);
    res.cookie(Constant.COOKIE_REFRESH_TOKEN, ts.refreshToken, cookieOpts);
    res.cookie(Constant.COOKIE_ACCESS_TOKEN, ts.accessToken, cookieOpts);
    res.json(ts);
  });


  // Starts "Sign in with Google" — unauthenticated entry point from the landing page (and the
  // login page's Google button).
  googleStart = catchAsync(async (req, res) => {
    const url = accountAuthService.getGoogleAuthUrl(req.joiData.organizationId);
    res.redirect(url);
  });

  // No auth() on this route (see routes/v1/index.js) — identity comes from the signed state
  // param, not a cookie (see service.accountAuth.js). This is a real browser navigation the
  // whole way through: finds-or-creates the Account, then sets the same session cookies
  // /auth/login sets and lands the browser on the dashboard already signed in.
  googleCallback = catchAsync(async (req, res) => {
    if (!req.joiData.code) {
      // User cancelled/denied on Google's consent screen rather than completing it.
      return res.redirect(`${accountAuthService.getFrontendUrl()}/auth/login?error=google_auth_cancelled`);
    }
    try {
      const account = await accountAuthService.handleGoogleCallback(req.joiData.code, req.joiData.state);
      const ts = await authService.createTokenSetForUserLogin(account);
      await authService.recordSuccessfulSignIn(account.id, { clientInfo: req.clientInfo, method: "google", account });
      res.cookie(Constant.COOKIE_REFRESH_TOKEN, ts.refreshToken, cookieOpts);
      res.cookie(Constant.COOKIE_ACCESS_TOKEN, ts.accessToken, cookieOpts);
      // NOTE: we deliberately do NOT set a was_logged_in-style marker cookie here — a cookie set
      // in this response is host-only to api(-stg).paprcraft.com, and JS running on
      // dashboard(-stg).paprcraft.com's own origin can never see it via document.cookie no matter
      // what SameSite says (SameSite only governs whether a cookie is SENT WITH REQUESTS, not
      // whether a different origin's JS can read it). The password-login flow's was_logged_in
      // cookie works because the FRONTEND sets it itself, client-side, after reading the login
      // response body (store.account.js's _afterLogin) — there's no equivalent JS step in this
      // server-redirect flow. Instead, the ?google_signin=1 marker below tells the dashboard's
      // router (router.js beforeEach) to call /auth/resume-login directly on load, which reads
      // the rf cookie we just set — that cookie DOES travel correctly on that same-site XHR
      // (dashboard-stg and api-stg share the paprcraft.com site for SameSite purposes), even though
      // JS can't read it directly.
      res.redirect(`${accountAuthService.getFrontendUrl()}/?google_signin=1`);
    } catch (err) {
      console.error('[googleCallback] Google sign-in failed:', err);
      const code = err?.errorCode === "account_suspended" ? "account_suspended" : "google_auth_failed";
      res.redirect(`${accountAuthService.getFrontendUrl()}/auth/login?error=${code}`);
    }
  });

  signOut = catchAsync(async (req, res) => {
    const rt = req.joiData?.refreshToken;
    const t = await tokenService.removeByToken(tokenType.REFRESH, rt);
    let msg = "Session ended. Signed out successfully.";
    if (t.length == 0) {
      msg = "Session ended. Warning: token not removed."
    }
    res.clearCookie(Constant.COOKIE_REFRESH_TOKEN);
    res.clearCookie(Constant.COOKIE_ACCESS_TOKEN);
    res.json({ message: msg });
  });




  /*
  verifyToken = catchAsync(async (req, res, next) => {
    const { token } = req.joiData;
    const tokenData = await tokenService.getByToken(token);
    if (!tokenData) {
      throw new ApiError(httpStatus.UNAUTHORIZED, errorType.TOKEN_EXPIRED, errorMessage.TOKEN_EXPIRED);
    }
    let responsePayload = { message: "Token verified successfully" };
    res.json(responsePayload);
  });
*/
}

