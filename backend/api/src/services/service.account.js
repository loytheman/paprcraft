import { getOneTable, getS3Client } from "./index.js";
// import { getPresignedUrl, copyS3Object } from "../helpers/functions.js";
import { PutObjectCommand } from "@aws-sdk/client-s3";
// import * as accessService from "../services/service.access.js";
import * as tokenService from "../services/service.token.js";
import Utils from "../helpers/utils.js";
import _ from "lodash";
import { ApiError, errorType, errorMessage } from "../middlewares/error.js";
import httpStatus from "http-status";
// import { notificationType } from "../models/model.site.js";
import { PaginationResult } from "../helpers/paginationResult.js";
import config from "../config/config.js";
import { accountSchema } from "../models/model.account.js";

const table = await getOneTable();
const accountModel = table.getModel("Account");
const s3Client = getS3Client();

let profileProjection = ["createdAt", ...Object.keys(_.omit(accountSchema, ["passwordHash", "_type"]))];

export const getAccountByEmail = async (email) => {
  // const o = await accountModel.get({ email }, { index: "gs2", fields: profileProjection });
  const o = await accountModel.get({ email }, { index: "gs2" });
  // if (!o) {
  //   throw new ApiError(httpStatus.NOT_FOUND, errorType.NOT_FOUND, "Profile not found");
  // }
  return o;
};

export const getProfileById = async (id) => {
  // const o = await accountModel.get({ id: id }, { fields: profileProjection });
  const o = await accountModel.get({ id: id });
  if (!o) {
    throw new ApiError(httpStatus.NOT_FOUND, errorType.NOT_FOUND, "Profile not found");
  }
  if (o?.displayPicture) {
    const dpUrl = `${config.central.apiUrl}/v1/public/${o.displayPicture.path}`;
    o.displayPicture = dpUrl;
  }
  return o;
};

export const getAccountById = async (id, needPasswordHash) => {
  const fields = needPasswordHash ? ["passwordHash", ...profileProjection] : profileProjection;
  const m = await accountModel.get({ id }, { hidden: true, fields: fields });
  if (!m) {
    throw new ApiError(httpStatus.NOT_FOUND, errorType.NOT_FOUND, "Profile not found");
  }
  return m;
};

export const updateProfile = async (email, joiData, blameFunc) => {
  const displayPicture = await updateDisplayPicture(email, joiData.displayPicture);
  const data = { id: email, ...joiData };
  const updatedData = _.omit(data, ["id", "displayPicture"]);
  let dpUrl = "";
  if (displayPicture) {
    updatedData.displayPicture = displayPicture;
    dpUrl = `${config.central.apiUrl}/v1/public/${displayPicture.path}`;
  }
  const o = await accountModel.update({ id: email }, { set: { ...updatedData }, postFormat: blameFunc });
  return {
    salutation: o.salutation,
    firstName: o.firstName,
    lastName: o.lastName,
    dob: o.dob,
    displayPicture: dpUrl,

    mobileCountryCode: o.mobileCountryCode,
    mobile: o.mobile,
    mobileFull: o.mobileFull,

    updatedAt: o.updatedAt,
  };
};

export const updatePassword = async (email, passwordHash) => accountModel.update({ id: email }, { set: { passwordHash } });

// A sign-in is also an audit-trail event ("signed in", with IP and city/country): stamping
// updatedBy + a fresh auditStreamId is what tells the audit Lambda (backend/lambda/auditTrail.js)
// a person did this, rather than a system write.
// account: { name?, email? } so the Activity row reads "Jane signed in", not "Someone".
export const updateSignedInAt = async (id, { clientInfo, method, account = null } = {}) =>
  accountModel.update(
    { id },
    {
      set: {
        signedInAt: new Date().toISOString(),
        updatedBy: {
          userId: id,
          name: [account?.firstName, account?.lastName].filter(Boolean).join(" ") || null,
          email: account?.email ?? null,
          signInMethod: method ?? null,
          ...(clientInfo || {}),
        },
        auditStreamId: Utils.ulid(),
      },
    }
  );

const updateDisplayPicture = async (email, dp) => {
  if (!dp?.path || !dp?.key) return null;
  const newPath = Utils.insertStringAt(dp.path, 12, `/${email}`);
  await copyS3Object(dp.key, newPath);
  return { baseUrl: dp.baseUrl, path: newPath };
};

export const checkNotification = async (userId, email) => {
  //invitation
  const o = {};
  let n, str;
  n = await tokenService.getCompanyAccountInvitationTokenByEmail(email);
  str = notificationType.COMPANY_ACCOUNT_INVITATION;
  o[str] = n;

  n = await tokenService.getPurchaseModuleInvitationToken(email);
  str = notificationType.EXT_PURCHASE_MODULE_INVITATION;
  o[str] = n;

  return o;
};

export const getEmails = async () => {
  const emails = await accountModel.find({}, { index: "gs1" });
  const data = emails.map((email) => ({ email: email.email, value: email.email }));
  return data;
};

export const createUserAccount = async (userData, blameable = null) => {
  const { email } = userData;
  let u = await getAccountByEmail(email);
  if (u) throw new ApiError(httpStatus.BAD_REQUEST, errorType.ALREADY_EXISTS, errorMessage.TRY_DIFFERENT_EMAIL);
  // organizationId keys the gs0 index the staff Accounts list reads. Not every caller passes it,
  // so fall back to the default org rather than creating an account the list can't see.
  const withOrg = { ...userData, organizationId: userData.organizationId || config.defaultOrganizationId };
  const data = blameable ? { ...withOrg, createdBy: blameable.actionBy, auditStreamId: blameable.auditStreamId } : withOrg;
  u = await accountModel.create(data);
  return u;
};

export const uploadAccountPhoto = async (image, email) => {
  if (!image || !email) return null;
  const baseUrl = config.aws.s3BaseUrl;
  const ext = image.substring("data:image/".length, image.indexOf(";base64"));
  const path = `media/photos/${email}/${Utils.ulid()}.${ext}`;
  const format = image.substring(image.indexOf("data:") + 5, image.indexOf(";base64"));
  const base64String = image.replace(/^data:image\/\w+;base64,/, "");
  const buff = Buffer.from(base64String, "base64");
  const input = {
    Bucket: config.aws.s3Bucket,
    Key: path,
    Body: buff,
    ContentEncoding: "base64",
    ContentType: format,
  };
  const command = new PutObjectCommand(input);
  await s3Client.send(command);
  const u = await accountModel.update({ id: email }, { set: { displayPicture: { baseUrl, path: path } } });
  return u;
};


export const getAllAccounts = async (prev, next, limit, prevKey, nextKey, organizationId) => {
  let o = {};
  if (next) {
    o = { next: nextKey };
  } else if (prev) {
    o = { prev: prevKey };
  }
  const params = { status: "enabled", organizationId };
  const results = await accountModel.find(params, { index: "gs0", limit, ...o, reverse: true, hidden: true, fields: profileProjection });

  return new PaginationResult(results, limit);
};

export const searchAccounts = async (q, organizationId, limit) => {
  const params = { organizationId, status: "enabled" };
  const results = await accountModel.scan(params, {
    limit,
    hidden: true,
    fields: profileProjection,
    where: "contains(${keywordSearch}, @{q})",
    substitutions: { q: q.toLowerCase() },
  });
  return results;
};


export const updateAccount = async (joiData, blameable = null) => {
  const data = blameable ? { ...joiData, updatedBy: blameable.actionBy, auditStreamId: blameable.auditStreamId } : joiData;
  await accountModel.update(data);
  const account = await getAccountById(joiData.id);
  return account;
};

export const updateAccountPassword = async (id, passwordHash, blameable = null) => {
  const set = { passwordHash, ...(blameable && { updatedBy: blameable.actionBy, auditStreamId: blameable.auditStreamId }) };
  await accountModel.update({ id }, { set });
  const account = await getAccountById(id);
  return account;
};

export const deleteAccount = async (id, blameable = null) => {
  // if (blameable) {
  //   await accountModel.update({ id, status: "enabled" }, { set: { updatedBy: blameable.actionBy, auditStreamId: blameable.auditStreamId } });
  // }
  const o = await accountModel.remove({ id, status: "enabled" });
  return {};
};
