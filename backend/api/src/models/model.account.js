import { pwOptions, pickFromSchema, setDefault, joiPhotoSchema } from "./common.js";
import { customJoi as Joi, getPagination } from "./customJoi.js";
import Utils from "../helpers/utils.js";

export const salutationTypes = ["Mr.", "Ms.", "Mrs.", "Mdm.", "Dr.", "Prof."];
export const accountStatusTypes = ["normal", "suspended"];
export const accountRoleTypes = ["administrator", "user"];

export const verificationType = {
  EMAIL: "email",
  MOBILE: "mobile",
  VERIFY_RESET: "verify-reset",
  INVITE_SIGNUP: "invitation-signup",
};

export const accountStatusType = {
  NORMAL: "normal",
  SUSPENDED: "suspended",
};

export const accountRoleType = {
  ADMINISTRATOR: "administrator",
  USER: "user",
};

export const moduleType = {
  SALES: "sales_channels",
};

//#############################
//##### one table schema ######
//#############################

const photoSchema = {
  baseUrl: { type: String },
  path: { type: String },
};

export const accountSchema = {
  pk: { type: String, value: "#ACCOUNT:${id}" },
  sk: { type: String, value: "#ACCOUNT#METADATA" },

  gs0pk: { type: String, value: "#ACCOUNT#ORG:${organizationId}" }, 
  gs0sk: { type: String, value: "#ACCOUNT#ID:${id}" }, //this can be sorted since id is ulid

  gs1pk: { type: String, value: "#ACCOUNT#MOBILE:${mobileFull}" },
  gs1sk: { type: String, value: "#ACCOUNT#METADATA" }, 

  gs2pk: { type: String, value: "#ACCOUNT#EMAIL:${email}" },
  gs2sk: { type: String, value: "#ACCOUNT#METADATA" },

  id: { type: String, generate: "ulid" },
  sub: { type: String, value: "${id}", hidden: false },
  organizationId: { type: String },

  keywordSearch: { type: String, value: "${email} ${firstName} ${lastName}" }, //lowercase email, firstName, lastName for scan search.
  mobileFull: { type: String },
  mobileCountryCode: { type: String },
  mobile: { type: String },
  mobileVerified: { type: Boolean, default: false },
  email: { type: String, unique: true },
  emailVerified: { type: Boolean, default: false },
  displayPicture: { type: Object, schema: photoSchema },
  passwordHash: { type: String, hidden: true },
  salutation: { type: String },
  firstName: { type: String },
  lastName: { type: String },
  fullName: { type: String },
  dob: { type: String },
  signedInAt: { type: String },
  accountStatus: { type: String, default: "normal", enum: accountStatusTypes },
  role: { type: String, default: "user", enum: accountRoleTypes },
  signInAttempt: { type: Number, default: 0 },
  confirmedStatus: { type: Boolean, default: false },
  status: { type: String, default: "enabled" },
  internalNotes: { type: String },

  // Plans and billing (service.plan.js, service.billing.js): one Stripe subscription per account.
  // Everything below except billingExempt is a copy of Stripe's state, written only by
  // syncAccountFromStripe — never edit it directly, Stripe is the source of truth.
  plan: { type: String }, // free | pro | max, from the subscription's price; absent = free
  planNotified: { type: String }, // the plan last acted on, so one plan change emails once (service.billing.js)
  stripeCustomerId: { type: String },
  stripeSubscriptionId: { type: String },
  pendingChange: { type: Object }, // { plan, interval, at }: a downgrade waiting for renewal (Stripe schedule)
  billingInterval: { type: String }, // "month" | "year", from the subscription's price
  billingStatus: { type: String }, // Stripe subscription.status: active/past_due/unpaid/canceled/...
  cancelAt: { type: String }, // a cancellation scheduled in the portal — when the subscription ends
  currentPeriodEnd: { type: String },
  hasPaymentMethod: { type: Boolean },
  // Paprcraft-staff override (comps, testers, our own monitors): never billed, gets the top plan (Pro).
  // Set via PUT /account/:id/billing-exempt only.
  billingExempt: { type: Boolean, default: false },
  compPlan: { type: String }, // while billingExempt: "plus" | "pro" (absent = pro)
  // Paprcraft-staff limits for this account, over the plan's: { monitors: { value, until? }, ... }
  // (service.plan.js LIMIT_FIELDS). until = ISO date the override ends; absent = no end.
  limitOverrides: { type: Object },
  lastStaffAction: { type: Object }, // { action, reason, at, by }: the last staff change (service.staff.js)
  suspendedMonitorIds: { type: Array }, // what a suspension paused, resumed on unsuspend
  // Last Paprcraft-staff billing action (exempt / unexempt) with its required reason — written
  // together with updatedBy/auditStreamId, so the activity trail shows who did it and why.
  billingAdminNote: { type: Object },

  createdBy: { type: Object },
  updatedBy: { type: Object },
  auditStreamId: { type: String },
  _type:{ type: String },
};

//###########################
//##### joi validation ######
//###########################

export class AccountJoiSchema {
  constructor() {
    this.schema = {
      organizationId: Joi.string(),
      mobileCountryCode: Joi.string(),
      mobile: Joi.string().pattern(/^[0-9]+$/).min(8).max(20).messages({ "string.pattern.base": '"Mobile" should be a numeric' }),
      mobileFull: Joi.forbidden().default((parent) => parent.mobileCountryCode + parent.mobile),
      salutation: Joi.valid(...salutationTypes).default(salutationTypes[0]),
      email: Joi.string().trim().email().required(),
      emailConfirm: Joi.string().trim().valid(Joi.ref("email")).required().label("Email confirm").messages({ "any.only": "Emails do not match", "any.required": "Email confirmation is required" }),
      firstName: Joi.string().trim().min(2).max(30).required().label("First name").messages({ "string.pattern.base": "{{#label}} can only contain alphabetical characters" }),
      lastName: Joi.string().trim().min(2).max(30).required().label("Last name").messages({ "string.pattern.base": "{{#label}} can only contain alphabetical characters" }),
      fullName: Joi.string(),
      displayPicture: joiPhotoSchema,
      accountStatus: Joi.valid(...accountStatusTypes).default(accountStatusTypes[0]),
      role: Joi.valid(...accountRoleTypes).default(accountRoleTypes[1]),
      mobileVerified: Joi.boolean(),
      emailVerified: Joi.boolean(),
      password: pwOptions.label("Password"),
      confirmedStatus: Joi.boolean(),
      passwordConfirm: Joi.string().valid(Joi.ref("password")).required().messages({ "any.only": "Passwords do not match", "any.required": "Password confirmation is required" }),
      passwordHash: setDefault(Joi.ref("password", { adjust: (v) => Utils.hashPassword(v) })),
      internalNotes: Joi.string(),
    };
  }

  // Joi.forbidden().failover(val).default("val");
  get createAccount() {
    return this.schema;
  }

  get emailSignup() {
    return this.schema;
  }

  get updateProfile() {
    return pickFromSchema(this.schema, ["firstName", "lastName", "fullName", "displayPicture", "dob", "salutation", "mobile", "mobileCountryCode"]);
  }

  get updatePhoneNumber() {
    return pickFromSchema(this.schema, ["mobileCountryCode", "mobile", "mobileFull"]);
  }

  get updateEmail() {
    return pickFromSchema(this.schema, ["email"]);
  }

  get updatePassword() {
    return pickFromSchema(this.schema, ["currentPassword", "password", "passwordConfirm", "passwordHash"]);
  }

  // Admin-initiated reset from the dashboard — sets a new password directly, no current
  // password / forgot-password token required.
  get adminResetPassword() {
    return {
      id: Joi.string().required(),
      ...pickFromSchema(this.schema, ["password", "passwordConfirm", "passwordHash"]),
    };
  }

  get getAccountByEmail() {
    return pickFromSchema(this.schema, ["email"]);
  }

  get searchAccounts() {
    return {
      organizationId: Joi.string().required(),
      q: Joi.string().trim().min(1).required().label("Search query"),
      limit: Joi.number().min(1).max(100).default(20),
    };
  }

  get getAllAccounts() {
    return {
      organizationId: Joi.string().required(),
      ...getPagination(),
    };
  }

  get getAccountById() {
    return {
      id: Joi.string().required(),
    };
  }

  get updateAccount() {
    const s = pickFromSchema(this.schema, [
      "firstName",
      "lastName",
      "fullName",
      "salutation",
      "mobile",
      "mobileCountryCode",
      "mobileFull",
      "displayPicture",
      "internalNotes",
      "accountStatus",
      "role",
    ]);
    return {
      id: Joi.string().required(),
      ...s,
    };
  }

  get deleteAccountById() {
    return {
      id: Joi.string().required(),
    };
  }
}
