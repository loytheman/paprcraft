import { customJoi as Joi } from "./customJoi.js";
import passwordComplexity from "joi-password-complexity";
import Utils from "../helpers/utils.js";
import config from "../config/config.js";
import _ from "lodash";

const S3_BASE_URL = config.aws.s3BaseUrl ?? "";
const S3_PATH_PREFIX = "media/photos/";
const S3_PATH_PREFIX_FORM = "media/forms/documents"

export const pickFromSchema = (schema, keys) =>
  _.pick(_.cloneDeep(schema), keys);


export const omitFromSchema = (schema, keys) =>
  _.omit(_.cloneDeep(schema), keys);

export const ulidRegex = /^[0123456789ABCDEFGHJKMNPQRSTVWXYZ]{26}$/;
export const isoDateRegex =
  /\d{4}-[01]\d-[0-3]\dT[0-2]\d:[0-5]\d:[0-5]\d\.\d+([+-][0-2]\d:[0-5]\d|Z)/;

export const pwOptions = passwordComplexity({
  min: 8,
  max: 64,
  lowerCase: 1,
  upperCase: 1,
  numeric: 1,
  symbol: 1,
  requirementCount: 4,
}).required();

export const setDefault = (val) => Joi.forbidden().default(val).failover(val);

export const joiPhotoSchema = Joi.object().keys({
  //key: Joi.string().allow(null, "").required(),
  key: Joi.string().allow(null, ""),
  baseUrl: Joi.when("key", {
    is: Joi.exist(),
    then: Joi.forbidden().default(S3_BASE_URL),
  }),
  path: Joi.when("key", {
    is: Joi.exist(),
    then: Joi.forbidden().default(
      Joi.ref("key", {
        adjust: (v) => S3_PATH_PREFIX + v.split("\\").pop().split("/").pop(),
      })
    ),
  }),
});


