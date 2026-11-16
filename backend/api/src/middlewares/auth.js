import Constant from "../helpers/constant.js";
import { ApiError, catchAsync, errorType, errorMessage } from "./error.js";
import { accountRoleType } from "../models/model.account.js";
import accountMemberModel, { memberStatus } from "../models/model.accountMember.js";
import { getAccountPlan } from "../services/service.plan.js";
import config from "../config/config.js";
import httpStatus from "http-status";
import jwt from "jsonwebtoken";

// personal: the route is about the signed-in person, not an account they work in (accepting an
// invite, listing or leaving teams), so the active-account check and the viewer rule don't apply.
export const auth = ({ personal = false } = {}) => catchAsync(async (req, res, next) => {
    const secret = config.jwt.userSecret;
    //loynote: get header token first, else get from cookie
    const accessToken = req.headers?.authorization || "Bearer " + req.cookies[Constant.COOKIE_ACCESS_TOKEN];
    // console.log("req.cookies", req.cookies);
    if (!accessToken) {
      throw new ApiError(httpStatus.UNAUTHORIZED, errorType.MISSING_API_CREDENTIALS, errorMessage.MISSING_API_CREDENTIALS);
    }
    try {
      //loynote: Slice "Bearer XXXXX";
      const t = accessToken.slice(7);
      // console.log("[auth accessToken]", t);
      const decoded = jwt.verify(t, secret);
      // console.log("[auth decoded]: ", decoded)
      req.claimData = decoded;
      req.userData = decoded;
    } catch (e) {
      console.log("[auth error]", e)
      // if (e.name === "TokenExpiredError") {
      //   throw new ApiError(httpStatus.UNAUTHORIZED, errorType.JWT_EXPIRED, errorMessage.JWT_EXPIRED);
      // }
      // throw new ApiError(httpStatus.UNAUTHORIZED, errorType.JWT_INVALID, errorMessage.JWT_INVALID);
      throw new ApiError(httpStatus.UNAUTHORIZED, errorType.INVALID_CREDENTIALS, errorMessage.INVALID_CREDENTIALS);
    }
    if (personal) {
      req.accountId = req.userData.sub;
      req.accountRole = "owner";
    } else await resolveActiveAccount(req);
    next();
  });

// ---- Which account a request works in -------------------------------------------------------
// The person signed in (req.userData.sub) and the account they're working in (req.accountId) can
// differ: team members work in other people's accounts (Pro only; service.team.js). The dashboard
// sends the account in the X-Paprcraft-Account header; none (or your own id) = your own account,
// where you are the owner. Data routes use req.accountId; personal things (sign-in, your own
// Account page, closing your account) use req.userData.sub.
//   req.accountRole: "owner" | "member" | "viewer"
// Viewers are read-only: any change request is refused here. Owner-only routes add requireOwner().
// Access is re-checked at most every ACCESS_TTL_MS per person and account (a removed member, or an
// account that left Pro, loses access within that time).
const ACCOUNT_HEADER = "x-paprcraft-account";
const ACCESS_TTL_MS = 30 * 1000;
const accessCache = new Map(); // "<userId>:<accountId>" -> { role, at }
export const forgetAccess = (userId, accountId) => accessCache.delete(`${userId}:${accountId}`);
const READ_METHODS = ["GET", "HEAD", "OPTIONS"];

export const resolveActiveAccount = async (req) => {
  const sub = req.userData?.sub;
  const requested = String(req.headers?.[ACCOUNT_HEADER] ?? "").trim();
  if (!requested || requested === sub) {
    req.accountId = sub;
    req.accountRole = "owner";
    return;
  }
  const key = `${sub}:${requested}`;
  let hit = accessCache.get(key);
  if (!hit || Date.now() - hit.at > ACCESS_TTL_MS) {
    const membership = await accountMemberModel.getForUserAndAccount(sub, requested);
    let role = null;
    if (membership?.status === memberStatus.ACTIVE) {
      const plan = await getAccountPlan(requested);
      // A team needs Pro (teamLimit > 1); a suspended account is closed to its team too.
      if (plan.teamLimit > 1 && !plan.suspended) role = membership.role;
    }
    hit = { role, at: Date.now() };
    accessCache.set(key, hit);
  }
  if (!hit.role) throw new ApiError(httpStatus.FORBIDDEN, errorType.NO_PERMISSION, "You don't have access to that account.");
  req.accountId = requested;
  req.accountRole = hit.role;
  if (hit.role === "viewer" && !READ_METHODS.includes(req.method)) {
    throw new ApiError(httpStatus.FORBIDDEN, errorType.NO_PERMISSION, "Viewers can't make changes. Ask the account owner for Member access.");
  }
};

// Owner-only (billing, the team, closing the account). Place after auth().
export const requireOwner = () => (req, res, next) => {
  if (req.accountRole !== "owner") return next(new ApiError(httpStatus.FORBIDDEN, errorType.NO_PERMISSION, "Only the account owner can do this."));
  next();
};

export const authRefreshToken = () =>
  catchAsync(async (req, res, next) => {
    const cookieName =  Constant.COOKIE_REFRESH_TOKEN;
    // let token;
    let token = req.cookies[cookieName];
    // console.log("[authRefreshToken cookies]: ", req.cookies);
    const data = { ...req.body, ...req.params, ...req.query };
    // console.log("[authRefreshToken]: ", data);
    if (data?.refreshToken) {
      token = data.refreshToken;
    } 
    // console.log("[authRefreshToken token]: ", token);
    if (!token) {
      throw new ApiError(httpStatus.UNAUTHORIZED, errorType.MISSING_REFRESH_TOKEN, errorMessage.MISSING_REFRESH_TOKEN);
    }
    req.joiData = { refreshToken: token };
    next();
  });


// Place after auth() — relies on req.userData.role from the access token.
export const requireRole = (...roles) =>
  catchAsync(async (req, res, next) => {
    if (!roles.includes(req.userData?.role)) {
      throw new ApiError(httpStatus.FORBIDDEN, errorType.NO_PERMISSION, errorMessage.NO_PERMISSION);
    }
    next();
  });

export const requireAdmin = () => requireRole(accountRoleType.ADMINISTRATOR);
