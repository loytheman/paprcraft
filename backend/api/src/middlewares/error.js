import httpStatus from "http-status";
import config from "../config/config.js";
import _ from "lodash";

export const errorType = {
  BAD_REQUEST: "bad_request",
  ACCOUNT_SUSPENDED: "account_suspended", // staff suspended the account (service.staff.js)
  INVALID_CREDENTIALS: "invalid_credentials",
  INVALID_INDEX: "invalid_index",
  JWT_EXPIRED: "jwt_expired",
  JWT_INVALID: "jwt_invalid",
  MISSING_API_CREDENTIALS: "missing_api_credentials",
  MISSING_REFRESH_TOKEN: "missing_refresh_token",
  NO_PERMISSION: "no_permission",
  NOT_FOUND: "not_found",
  REFRESH_TOKEN_EXPIRED: "refresh_token_expired",
  REFRESH_TOKEN_INVALID: "refresh_token_invalid",
  TOKEN_INVALID: "token_invalid",
  TOKEN_EXPIRED: "token_expired",
  UPLOAD_ERROR: "upload_error",
  VALIDATION_ERROR: "validation_error",
  CANNOT_DELETE: "cannot_delete",
  BATCH_REQUEST_FAIL: "batch_request_fail",
  CAPTCHA_VERIFICATION_FAIL: "captcha_verification_fail",
};

export const errorMessage = {
  BAD_REQUEST: "The request is missing required information.",
  EMAIL_NOT_FOUND: "The email address provided is incorrect.",
  INVALID_CREDENTIALS: "The provided credentials are invalid.",
  INVALID_INDEX: "The provided index is outside the permissible range.",
  ITEM_NOT_FOUND: "The item you are trying to access does not exist.",
  JWT_EXPIRED: "The JWT token provided has expired.",
  JWT_INVALID: "The provided JWT is invalid. Unauthorized access.",
  MISSING_API_CREDENTIALS: "Missing api credentials",
  MISSING_REFRESH_TOKEN: "Refresh token is missing from cookies/body. Unauthorized access.",
  NO_PERMISSION: "You do not have permission to perform this action.",
  NOT_FOUND: "The requested resource couldn't be found.",
  TOKEN_EXPIRED: "Invalid or expired token.",
  TOKEN_INVALID: "Invalid or expired token.",
  TRY_DIFFERENT_EMAIL: "The email address provided is already in use.",
  UPLOAD_ERROR: "Failed to upload one or more documents.",
  VALIDATION_ERROR: "There are validation errors. Please correct and resubmit.",
  BATCH_REQUEST_FAIL: "Request fail in one part of a batch",
  CAPTCHA_VERIFICATION_FAIL: "Failed to verify the captcha information.",
};

export class ApiError extends Error {
  constructor(statusCode, errorCode = null, message = null, data = null, isOperational = true) {
    super(message);
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.message = message;
    this.data = data;
    this.isOperational = isOperational;
    Error.captureStackTrace(this, this.constructor);
  }
}

export const errorConverter = (err, req, res, next) => {
  let message = httpStatus[err.statusCode];
  if (err.isJoi) {
    err.statusCode = httpStatus.UNPROCESSABLE_ENTITY;
    err.errorCode = errorType.VALIDATION_ERROR;
    err.message = errorMessage.VALIDATION_ERROR;
    err.data = { validation: JSON.stringify(_prepareJoiErrorArr(err)) };
  } else if (err instanceof ApiError) {
    err.statusCode = err.statusCode;
    err.errorCode = err.errorCode;
    err.message = err.message || message;
    err.data = err.data || null;
  } else if (err.isAxiosError) {
    const { method, url } = err.config;
    const { status, data } = err.response || {};
    err.statusCode = status || httpStatus.INTERNAL_SERVER_ERROR;
    err.errorCode = data?.code || 500;
    // err.message = `Axios Error [${method.toUpperCase()} ${url}]\n${data?.message || "unknown error"}`.split("\n");
    err.message = `Axios Error [${method.toUpperCase()} ${url}]\n${data?.message || "unknown error"}`;
    err.data = data?.data;
  } else if (err.name === "OneTableError") {
    err.statusCode = httpStatus.INTERNAL_SERVER_ERROR;
    err.message = _prepareOneTableError(err);
    err.errorCode = err.code || null;
    err.data = err.data || null;
  } else {
    err.statusCode = httpStatus.INTERNAL_SERVER_ERROR;
    err.message = err.message || message;
    err.errorCode = err.Code || null;
    err.data = err.data || null;
  }

  next(err);
};

export const errorHandler = (err, req, res, next) => {
  const statusCode = err.statusCode || httpStatus.INTERNAL_SERVER_ERROR;
  const responseStatus = statusCode === httpStatus.INTERNAL_SERVER_ERROR ? "error" : "fail";
  const message = err.message || httpStatus[statusCode];
  const { data, errorCode } = err;
  const response = {
    status: responseStatus,
    message: message,
    ...(config.env === "development" && { stack: err.stack.split("\n") }),
    ...(errorCode && { code: errorCode }),
    ...(data && { data: data }),
  };
  console.error("[errorHandler]", statusCode, responseStatus, JSON.stringify(response, null, 2));
  if (err.retryAfter) res.set("Retry-After", String(err.retryAfter)); // a rate-limited API trigger call (service.trigger.js)
  res.status(statusCode).send(response);
};

export const _prepareJoiErrorArr = (err) => {
  return err.details.map((detail) => {
    const key = detail.context.key;
    const message = detail.message.replace(/[\"]/g, "");
    return { field: key, message };
  });
};

export const _prepareOneTableError = (err) => {
  const uniqueErrorMessages = {
    registeredNumber: "Registered Number/UEN must be unique.",
    email: "Email address must be unique.",
    identification: (value, label) => `${label} number ${value} must be unique.`,
    duplicateEntry: (value, label) => `Duplicate entry ${label} number ${value}.`,
  };

  if (err.code === "UniqueError") {
    const matches = Array.from(err.message.matchAll(/"([^"]*)"/g), (m) => m[1]);
    if (matches.length > 0 && uniqueErrorMessages[matches[0]]) {
      return uniqueErrorMessages[matches[0]];
    }
  }

  if (err.code === "TransactionCanceledException") {
    const transactItems = err.context?.trace?.cmd?.TransactItems || [];
    const cancellationReasons = err.context?.err?.CancellationReasons || [];

    for (let index = 0; index < transactItems.length; index++) {
      const item = transactItems[index];
      const pkValue = item?.Put?.Item?.pk?.S;

      if (pkValue?.includes("#UNIQUE")) {
        if (pkValue.includes("nric") || pkValue.includes("passport")) {
          const parts = pkValue.split("#");
          const label = _.upperCase(parts[3] || "");
          const value = parts[4] || "";
          return uniqueErrorMessages.identification(value, label);
        } else if (pkValue.includes("email")) {
          return uniqueErrorMessages.email;
        }
      }

      const reason = cancellationReasons[index];
      if (reason?.Code && reason.Code !== "None") {
        return `Transaction failed: ${reason.Code} ${reason.Message || "No message provided."}`;
      }
    }

    return "Transaction canceled for unspecified reasons.";
  }

  if (err.code === "ValidationException") {
    const transactItems = err.context?.trace?.cmd?.TransactItems || [];
    const cancellationReasons = err.context?.err?.CancellationReasons || [];
    for (let index = 0; index < transactItems.length; index++) {
      const item = transactItems[index];
      const pkValue = item?.Put?.Item?.pk?.S;

      if (pkValue?.includes("#UNIQUE")) {
        if (pkValue.includes("nric") || pkValue.includes("passport")) {
          const parts = pkValue.split("#");
          const label = _.upperCase(parts[3] || "");
          const value = parts[4] || "";
          return uniqueErrorMessages.duplicateEntry(value, label);
        }
      }

      const reason = cancellationReasons[index];
      if (reason?.Code && reason.Code !== "None") {
        return `Transaction failed: ${reason.Code} ${reason.Message || "No message provided."}`;
      }
    }
  }
  return err.message || "An unexpected error occurred.";
};

export const axiosErrorHandler = (error) => ({
  status: error.response?.status || 500,
  message: error.response?.statusText || "unknown error",
  data: error.response?.data || {},
});

export const catchAsync = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch((err) => next(err));
};

export const catchNotFound = (req, res, next) => {
  const e = new ApiError(httpStatus.NOT_FOUND, errorType.NOT_FOUND, errorMessage.NOT_FOUND);
  next(e);
};
