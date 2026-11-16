import JoiBase from "joi";
import JoiDate from "@joi/date";
import { PaginationResult } from "../helpers/paginationResult.js";

const Joi = JoiBase.extend(JoiDate);
const opts = { abortEarly: false, stripUnknown: true };
const customJoi = Joi.defaults((schema) => schema.options(opts).empty(["", null]));

const getJoiDataAsync = async (schema, data, additionalErrors = []) => {
  try {
    return await customJoi.object(schema).validateAsync(data);
  } catch (joiError) {
    if (additionalErrors.length > 0) {
      joiError.details = [...joiError.details, ...additionalErrors];
    }
    throw joiError;
  }
};

const getPagination = () => {
  return {
    next: customJoi.string().allow(null),
    prev: customJoi.string().allow(null),
    limit: customJoi.number().min(1).max(200).default(10),
    nextKey: customJoi.forbidden().default(
      customJoi.ref("next", {
        adjust: (v) => {
          if (v) {
            return PaginationResult.base64ToJson(v);
          }
          return null;
        },
      })
    ),
    prevKey: Joi.forbidden().default(
      Joi.ref("prev", {
        adjust: (v) => {
          if (v) {
            return PaginationResult.base64ToJson(v);
          }
          return null;
        },
      })
    ),
  };
};

export { getJoiDataAsync, customJoi, getPagination };
