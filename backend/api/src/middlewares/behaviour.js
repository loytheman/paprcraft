import _ from "lodash";
import Utils from "../helpers/utils.js";
// import companyModel from "../models/model.company.js";
// import individualModel from "../models/model.individual.js";
// import requestModel from "../models/model.request.js";
// import userAdminModel from "../models/model.user.admin.js";
// import documentSignModel from "../models/model.document.sign.js";
// import documentModel from "../models/model.document.js";
// import companyFormModel from "../models/model.company.form.js";
// import caseModel from "../models/model.case.js";
// import nameSearchModel from "../models/model.namesearch.js";
// import documentTemplateModel from "../models/model.document.template.js";
// import * as documentSignService from "../services/service.document.sign.js";
import { catchAsync } from "./error.js";
import { UAParser } from "ua-parser-js";
import geodecodeIp from "micro-geoip-lite";
import config from "../config/config.js";

export const blameableBehaviour = (req, res, next) => {
  const { sub, name, email, mobileFull } = req.userData || {};
  const userId = sub ?? null;
  const userAuditInfo = _.omitBy(req.systemAudit || { userId, name: name ?? null, email, mobileFull, ...req.clientInfo }, _.isUndefined);

  req.actionBy = userAuditInfo;

  req.blameable = {
    actionBy: userAuditInfo,
    auditStreamId: Utils.ulid(),
  };

  next();
};

// Paprcraft staff acting on a customer's account (routes under /staff): marked, so the customer's
// own Activity shows "Paprcraft support" rather than the staff member and their IP/location.
export const staffBehaviour = (req, res, next) =>
  blameableBehaviour(req, res, () => {
    req.blameable.actionBy = { ...req.blameable.actionBy, staff: true };
    req.actionBy = req.blameable.actionBy;
    next();
  });

// A customer filling a form through a link: no user, so the audit trail says "Customer (link)"
// with the IP and device of the request.
export const publicLinkBehaviour = (req, res, next) => {
  const actionBy = _.omitBy({ userId: null, name: "Customer (link)", ...req.clientInfo }, _.isUndefined);
  req.actionBy = actionBy;
  req.blameable = { actionBy, auditStreamId: Utils.ulid() };
  next();
};

export const prepareBlameable = async (req, res, next) => {
  const { sub, firstName, lastName, email } = req.userData || {};
  const userId = sub ?? null;
  const name = `${firstName ?? ""} ${lastName ?? ""}`.trim() || null;
  req.blameable = {
    createdBy: { userId, name, email },
    updatedBy: { userId, name, email },
  };
  next();
};

export const systemAuditInfo = (name) => (req, res, next) => {
  req.systemAudit = { name: `SYSTEM ${name.toUpperCase()}` };
  next();
};

export const keywordSearchBehaviour = (modelName) =>
  catchAsync(async (req, res, next) => {
    res.on("finish", async () => {
      if (res.statusCode !== 200) {
        next();
        return;
      }

      let keywordPaths;
      let entityModel;
      let data = res.locals.responseData;

      switch (modelName) {
        // case "Company":
        //   keywordPaths = ["companyName", "registeredNumber"];
        //   entityModel = companyModel;
        //   break;
        // case "Individual":
        //   keywordPaths = ["fullName", "firstName", "lastName", "email"];
        //   if (data.identifications?.length > 0) {
        //     for (let i = 0; i < data.identifications.length; i++) {
        //       keywordPaths.push(`identifications[${i}].idNo`);
        //     }
        //   }
        //   entityModel = individualModel;
        //   break;
        // case "DocumentSign":
        //   entityModel = documentSignModel;
        //   keywordPaths = ["fileName", "signerName", "sentBy.name"];
        //   data = {
        //     ...data,
        //     fileName: (await documentSignService.getDocumentSignFileName(data.id)).join(" "),
        //     signerName: await documentSignService.getDocumentSignSignerName(data.id),
        //   };
        //   break;
        // case "Case":
        //   entityModel = caseModel;
        //   keywordPaths = ["searchName"];
        //   data = {
        //     ...data,
        //     ...(data.caseType === "company" && { searchName: (await companyModel.getCompanyById(data.referenceId)).companyName }),
        //     ...(data.caseType === "individual" && { searchName: (await individualModel.getIndividualById(data.referenceId)).fullName }),
        //   };
        //   break;
        // case "Document":
        //   entityModel = documentModel;
        //   keywordPaths = ["fileName"];
        // default:
      }
      const dataArray = Array.isArray(data) ? data : [data];
      const tasks = dataArray.map((item) => {
        const keywords = keywordPaths.flatMap((path) => _.get(item, path, "")).map((keyword) => keyword.toLowerCase().trim());
        const uniqueKeyWords = [...new Set(keywords)].join(" ").trim();
        return entityModel.updateKeywordSearch(item.id, uniqueKeyWords);
      });
      await Promise.all(tasks);
    });

    next();
  });

export const clientInfoBehaviour = catchAsync(async (req, res, next) => {
  let ipAddress = req.headers["x-forwarded-for"] || req.connection.remoteAddress;
  if (config.stageEnv === "local") ipAddress = "127.0.0.1";
  const userAgent = req.headers["user-agent"];
  const parser = new UAParser();
  const deviceInfo = parser.setUA(userAgent).getResult();
  const result = await geodecodeIp(ipAddress);
  // City/region/country only — no coordinates. This rides along in every change's
  // updatedBy/createdBy and so ends up in the audit trail (kept indefinitely); a coarse location
  // is all that's needed to spot a sign-in or change from somewhere unexpected.
  const locationData = {
    city: result.city,
    region: result.region,
    country: result.country,
  };
  const clientInfo = {
    deviceType: deviceInfo.device.type || "desktop",
    os: deviceInfo.os.name,
    osVersion: deviceInfo.os.version,
    browser: deviceInfo.browser.name,
    browserVersion: deviceInfo.browser.version,
  };
  req.clientInfo = Utils.stripUnknown({ ip: ipAddress, clientInfo, locationData });
  next();
});

//forgot what is this for.. something to do with */key in get path
export const prepareCombineWildCardPath = (wildcardParam) => async (req, res, next) => {
  const data = { ...req.body, ...req.params, ...req.query };
  // console.log("[prepareCombineWildCardPath]: ", data);
  
  const arr = data[wildcardParam];
  const path = arr.join('/'); 
  req.params[wildcardParam] = path;
  // console.log(req.params); 

  next();
};