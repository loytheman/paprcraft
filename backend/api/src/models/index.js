
// import { accessSchema } from "./model.user.access.js";
import { accountSchema } from "./model.account.js";
import { auditTrailSchema } from "./model.activity.trail.js";
import { tokenSchema } from "./model.token.js";
import { accountMemberSchema } from "./model.accountMember.js";
import { labelSchema } from "./model.label.js";
import { apiKeySchema } from "./model.apiKey.js";
import { templateSchema } from "./model.template.js";
import { formSchema } from "./model.form.js";
import { submissionSchema } from "./model.submission.js";

// export const statusTypes = ["enabled", "disabled"];


export const OneTableSchema = {
  format: "onetable:1.1.0",
  version: "0.0.1",
  indexes: {
    primary: { hash: "pk", sort: "sk" },
    gs0: { hash: "gs0pk", sort: "gs0sk" },
    gs1: { hash: "gs1pk", sort: "gs1sk" },
    gs2: { hash: "gs2pk", sort: "gs2sk" },
    gs3: { hash: "gs3pk", sort: "gs3sk" },
    gs4: { hash: "gs4pk", sort: "gs4sk" },
    gs5: { hash: "gs5pk", sort: "gs5sk" },
  },
  models: {
    Account: accountSchema,
    Token: tokenSchema,
    AccountMember: accountMemberSchema,
    Label: labelSchema,
    ApiKey: apiKeySchema,
    Template: templateSchema,
    Form: formSchema,
    Submission: submissionSchema,
  },
  params: {
    partial: true,
    isoDates: true,
    nulls: true,
    timestamps: true,
    createdField: "createdAt",
    updatedField: "updatedAt",
  },
};

export const AuditTrailTableSchema = {
  format: "onetable:1.1.0",
  version: "0.0.1",
  indexes: {
    primary: { hash: "pk", sort: "sk" },
    gs0: { hash: "gs0pk", sort: "gs0sk" },
    gs1: { hash: "gs1pk", sort: "gs1sk" },
    gs2: { hash: "gs2pk", sort: "gs2sk" },
    gs3: { hash: "gs3pk", sort: "gs3sk" }, // added by infra/20-audit-trail.sh
  },
  models: {
    AuditTrail: auditTrailSchema,
  },
  params: {
    partial: true,
    isoDates: true,
    nulls: true,
    timestamps: true,
    createdField: "createdAt",
    updatedField: "updatedAt",
  },
};

