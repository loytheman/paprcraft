import { getJoiDataAsync } from "../models/customJoi.js";
import _ from "lodash";
import { organizationContext } from '../middlewares/_context.js';
import config from "../config/config.js";


// addDataFromClaim (["customerNo", "aud"])
export const addDataFromClaim = (arr) =>
  async (req, res, next) => {
    var dataObj = {}
    arr.map((c)=>{
      dataObj[c] = req.claimData[c];
    })
    console.log("[addDataFromClaim]: ", arr, dataObj );
    req.body = { ...req.body, ...dataObj};
    next();
  };


const prepareJoiAsync =
  (schema, isQuery = true) =>
    async (req, res, next) => {


    const orgId = organizationContext.getStore()?.orgId
               ?? req.headers['x-org-id']
               ?? config.defaultOrganizationId;

    const data = { ...req.body, ...req.params, ...req.query, organizationId: orgId };
    // console.log("[prepareJoiAsync]: ", data);
    try {
      const result = await getJoiDataAsync(schema, data, req.errors);
      // req.joiData = { ...result, organizationId: getOrganizationId() };
      req.joiData = result;
      if (req.errors && req.errors.length > 0) {
        const joiError = new Error("Validation Error");
        joiError.name = "ValidationError";
        joiError.isJoi = true;
        joiError.details = req.errors;
        throw joiError;
      }
      next();
    } catch (error) {
      next(error);
    }
  };

export default prepareJoiAsync;
