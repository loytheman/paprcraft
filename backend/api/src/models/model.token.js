import { customJoi as Joi } from "./customJoi.js";

export const tokenType = {
  REFRESH: "refresh",
  PRE_VERIFIED_TOKEN: "pre_verified_token",
  RESET_PASSWORD: "reset_password",
  INVITATION_TOKEN: "invitation_token",
  TEAM_INVITE: "team_invite", // service.team.js: joining someone's account (refId = AccountMember id)
  PREVIEW_COMPANY: "company_preview",
  DOCUMENT_SIGN: "document_sign",
};

export const tokenTypes = Object.values(tokenType);

export const tokenSchema = {
  pk: { type: String, value: "#TOKEN:${id}" },
  sk: { type: String, value: "#TOKEN#METADATA" },
  gs0pk: { type: String, value: "#TOKEN#METADATA#${tokenType}" },
  // gs0sk: { type: String, value: "#TOKEN#TIMESTAMP:${updatedAt}" },
  gs0sk: { type: String, value: "#TOKEN#ID:${id}" }, //this can be sorted since id is ulid
  gs1pk: { type: String, value: "#TOKEN:${token}" },  
  gs1sk: { type: String, value: "#TOKEN:${tokenType}" },
  gs2pk: { type: String, value: "#TOKEN#REF_ID:${refId}" },
  gs2sk: { type: String, value: "#TOKEN:${tokenType}" },
  id: { type: String, generate: "ulid" },
  refId: { type: String, required: true },
  token: { type: String, required: true },
  tokenType: { type: String, required: true, enum: tokenTypes },
  session: { type: String },
  data: { type: Object },
  attempt: { type: Number, default: 0 },
  expiresAt: { type: Number, required: true }, // app-level expiry check (Utils.checkExpired) — not the DynamoDB TTL attribute, see ttl below
  // epoch seconds, same moment as expiresAt — table-level TTL is enabled on this specific
  // attribute name (see infra/02-dynamodb-ttl.sh), so DynamoDB actually deletes the row once
  // this passes. expiresAt alone never got cleaned up automatically — same mistake as every
  // other model's items.
  ttl: { type: Number, required: true },
  status: { type: String, default: "enabled" },
  createdBy: { type: Object },
  updatedBy: { type: Object },
};

export class TokenJoiSchema {
  get getByRefreshToken() {
    return {
      refreshToken: Joi.string().required(),
    };
  }

  get getByToken() {
    return {
      token: Joi.string().required(),
    };
  }

  get authenticateIncorp() {
    return {
      token: Joi.string().required(),
      userId: Joi.string().required(),
    };
  }

  get verifyToken() {
    return {
      token: Joi.string().required(),
    };
  }
}
