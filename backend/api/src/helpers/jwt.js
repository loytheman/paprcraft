import config from "../config/config.js";
import Constant from "../helpers/constant.js";
import { ApiError, errorType, errorMessage } from "../middlewares/error.js";
import httpStatus from "http-status";
import jwt from "jsonwebtoken";
import jwksClient from "jwks-rsa";
import _ from "lodash";
import Utils from "../helpers/utils.js";


// This API's own host, as the token issuer — mirrors the stageEnv branching already used for
// redirect/frontend URLs in service.accountAuth.js.
const getIssuer = () => {
  if (config.stageEnv === "local") return `https://localhost:${config.port}`;
  const host = config.stageEnv === "prod" ? "api.paprcraft.com" : "api-stg.paprcraft.com";
  return `https://${host}`;
};

export const createJwt = (claims, expiry = null, audience = "gvs") => {
  const secret = config.jwt.userSecret;
  if (expiry == null) {
    expiry = Constant.JWT_TOKEN_EXPIRY;
  }
  // console.log("[createJwt: ", claims);


  const opts = {
    algorithm: "HS256",
    issuer: getIssuer(),
    audience: audience,
    // subject: sub,
    notBefore: 0,
    expiresIn: expiry
  };

  const t = jwt.sign(claims, secret, opts);
  return t;

};



