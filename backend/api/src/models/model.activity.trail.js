import { PaginationResult } from "../helpers/paginationResult.js";
import { customJoi as Joi, getPagination } from "./customJoi.js";

// Audit trail rows — written ONLY by the audit Lambda (backend/lambda/auditTrail.js + auditRow.js)
// from the main table's DynamoDB Stream; the API just reads them. Kept forever (no TTL). Key
// templates must match auditRow.js. One row per changed record per request:
//   who: actor { userId, name, email, ip, device, location: { city, region, country } } — or
//        "System" for changes not made through a person's request
//   what: recordType (+ optional recordKind) + recordLabel (e.g. Label "prod"),
//         action (created / updated / deleted / paused / resumed / verified / plan_changed /
//         signed_in), changes [{ field, from, to }] (secrets never included)
let auditTrailModel;
(async () => {
  const m = await import("../services/index.js");
  auditTrailModel = m.getOneTable2().getModel("AuditTrail");
})();

export const auditTrailSchema = {
  pk: { type: String, value: "#AUDIT:${id}" },
  sk: { type: String, value: "#AUDIT#METADATA" },
  // newest first within each view: sort key = "<ISO time>#<event id>"
  gs0pk: { type: String, value: "#AUDIT#ACCOUNT:${accountId}" }, // an account's activity
  gs0sk: { type: String, value: "${createdAt}#${id}" },
  gs1pk: { type: String, value: "#AUDIT#USER:${userId}" }, // everything one person did (incl. sign-ins)
  gs1sk: { type: String, value: "${createdAt}#${id}" },
  gs2pk: { type: String, value: "#AUDIT#REF:${refId}" }, // one record's history
  gs2sk: { type: String, value: "${createdAt}#${id}" },
  gs3pk: { type: String, value: "#AUDIT#ALL" }, // staff: everything
  gs3sk: { type: String, value: "${createdAt}#${id}" },

  id: { type: String, required: true }, // DynamoDB Stream event id
  createdAt: { type: String },
  action: { type: String },
  eventName: { type: String },
  recordType: { type: String },
  recordKind: { type: String },
  recordId: { type: String },
  recordLabel: { type: String },
  refId: { type: String },
  accountId: { type: String },
  userId: { type: String },
  actor: { type: Object },
  changes: { type: Array },
  auditStreamId: { type: String },
};

export class ActivityJoiSchema {
  // The caller's account, optionally one area of it (the Activity page's filter chips).
  get account() {
    return { category: Joi.string().valid(...Object.keys(CATEGORIES)), ...getPagination() };
  }

  // Paprcraft staff: everything, or narrowed to one user / one record.
  get staffList() {
    return {
      userId: Joi.string(),
      accountId: Joi.string(),
      refId: Joi.string(), // e.g. "#LABEL:01J..." (URL-encoded)
      ...getPagination(),
    };
  }
}

// Activity page filter -> which rows belong to it.
// Add one entry per record type you want a filter chip for.
export const CATEGORIES = {
  templates: (r) => r.recordType === "Template",
  labels: (r) => r.recordType === "Label",
  account: (r) => r.recordType === "Account",
};

const KEY_FIELDS = ["pk", "sk", "gs0pk", "gs0sk", "gs1pk", "gs1sk", "gs2pk", "gs2sk", "gs3pk", "gs3sk", "_type"];
const toCursor = (row, index) => PaginationResult.jsonToBase64({ pk: row.pk, sk: row.sk, [`${index}pk`]: row[`${index}pk`], [`${index}sk`]: row[`${index}sk`] });
const publicRow = (row) => Object.fromEntries(Object.entries(row).filter(([k]) => !KEY_FIELDS.includes(k)));

// Newest first. With a filter (keep), reads on until `limit` rows match (or the history runs out,
// or MAX_READS reads), so a filtered page is never short while more matching history exists.
// next: an opaque cursor for the following page, or null at the end.
const MAX_READS = 10;
const page = async (index, query, { nextKey, limit = 20 }, keep = null) => {
  const results = [];
  let start = nextKey || undefined;
  for (let reads = 0; reads < MAX_READS; reads++) {
    const rows = await auditTrailModel.find(query, { index, limit: keep ? 100 : limit, next: start, reverse: true, hidden: true });
    for (const row of rows) {
      if (keep && !keep(row)) continue;
      results.push(row);
      if (results.length === limit) {
        const more = row !== rows[rows.length - 1] || !!rows.next;
        return { results: results.map(publicRow), next: more ? toCursor(row, index) : null, limit };
      }
    }
    start = rows.next;
    if (!start) break;
  }
  // Ran out of history, or out of reads: hand back the read position so "Load more" carries on.
  return { results: results.map(publicRow), next: start ? PaginationResult.jsonToBase64(start) : null, limit };
};

export default {
  pageForAccount: (accountId, p, category) => page("gs0", { accountId }, p, category ? CATEGORIES[category] : null),
  pageForUser: (userId, p) => page("gs1", { userId }, p),
  pageForRecord: (refId, p) => page("gs2", { refId }, p),
  pageAll: (p) => page("gs3", {}, p),
};
