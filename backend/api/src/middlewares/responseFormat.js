// const config = require('../config/config');
// const httpStatus = require('http-status');
// const _ = require('lodash');
// const logger = require('../config/logger');
// const { catchAsync } = require('./error');

// ref:
// https://www.npmjs.com/package/express-mung
// https://github.com/omniti-labs/jsend
import mung from "express-mung";

const resFormat = (body, req, res) => {
  const b = {};
  res.locals.responseData = body;
  b.status = "success";
  // console.log("[resFormat]: ", body)
  b.data = body;

  const isPaginationResponse = body && typeof body === "object" && "results" in body && "limit" in body;
  if (isPaginationResponse) {
    b.data = body.results;
    b.pagination = {
      next: body.next,
      prev: body.prev,
      limit: body.limit,
    };
  }
  return b;
};

export const responseFormat = mung.json(resFormat);
