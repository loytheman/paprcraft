import Utils from "../helpers/utils.js";
import _ from "lodash";


let table;
let tokenModel;
(async () => {
  const m = await import("../services/index.js");
  table = m.getOneTable();
  tokenModel = table.getModel("Token");
})();

export const createToken = async (tokenType, token, refId, expiresIn) => {
  // Same epoch-seconds value in both — expiresAt is what getByToken/Utils.checkExpired check at
  // read time, ttl is what actually gets this row auto-deleted by DynamoDB (see model.token.js).
  const expiresAt = Math.round(Date.now() / 1000) + expiresIn;
  const data = { tokenType, token, refId, expiresAt, ttl: expiresAt };

  var r = await tokenModel.create(data);
  return r;
};

export const getByToken = async (tokenType, token) => {
  const t = await tokenModel.get({ token, tokenType }, { index: "gs1" });
  return Utils.checkExpired(t);
};

export const getByRefId = async (tokenType, refId) => {
  const t = await tokenModel.find({ refId, tokenType }, { index: "gs2" });
  return Utils.checkExpired(t);
};

export const removeByToken = async (tokenType, token) => {
  const t = await tokenModel.remove({ token, tokenType }, { index: "gs1" });
  console.log("[removeByToken]: ", t.length);
  return t;
};


// export const generateDocPreviewToken = async (fileKey, userId, sessionToken) => {
//   const token = jwt.sign({ key: fileKey, userId, sessionToken }, config.jwt.previewSecret);
//   return token;
// };

