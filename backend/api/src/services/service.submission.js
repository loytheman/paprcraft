// Form submissions (model.submission.js). Statuses: draft -> submitted -> approved | rejected; any
// of those can be reopened to draft. Values are editable only in draft.
//   - Account users (any non-viewer role) fill, submit, approve and reject.
//   - A customer can fill a draft through a link (createLink): the token is random, only its SHA-256
//     is stored, it expires, works for one submission, and locks when the customer submits. The
//     customer never sees `internal` fields. Every save is stamped with a "Customer (link)" actor so
//     the audit trail (backend/lambda/auditRow.js) records who changed what.
//   - Files are attached per file field through the upload-URL flow of service.attachment.js
//     (PNG, JPEG, WebP or PDF); a file field's value is the list of its attachment ids.
import crypto from "crypto";
import httpStatus from "http-status";
import { InvokeCommand } from "@aws-sdk/client-lambda";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { ApiError, errorType, errorMessage } from "../middlewares/error.js";
import config from "../config/config.js";
import submissionModel, { submissionStatus } from "../models/model.submission.js";
import { MASTER_ACCOUNT_ID } from "../models/model.template.js";
import Utils from "../helpers/utils.js";
import { getLambdaClient, getS3Client } from "./index.js";
import { getAccountModel } from "./service.accountLookup.js";
import { getFormFor } from "./service.form.js";
import { formStatus } from "../models/model.form.js";
import formModel from "../models/model.form.js";
import { getAccountPlan, planLimitError, isTopPlan, includesText, assertNotSuspended } from "./service.plan.js";
import { commitAttachments, deleteAttachments, deleteFolder, createUploadUrl, withUrls, recordFolder } from "./service.attachment.js";
import { sendEmail } from "./service.email.js";
import { getFormsUrl } from "./service.accountAuth.js";
import { formInviteEmail } from "../emails/email.formInvite.js";
import { allFields, normalizeValues, publicSchema, publicValues } from "../helpers/formEngine.js";
import { pdfUrls } from "./service.exportUrls.js";
const notFound = () => new ApiError(httpStatus.NOT_FOUND, errorType.NOT_FOUND, errorMessage.NOT_FOUND);
const badRequest = (msg) => new ApiError(httpStatus.BAD_REQUEST, errorType.BAD_REQUEST, msg);
const invalidLink = () => new ApiError(httpStatus.NOT_FOUND, errorType.NOT_FOUND, "This link isn't valid or has expired.");
const hashToken = (token) => crypto.createHash("sha256").update(token).digest("hex");
const DEFAULT_CONSENT = "I confirm the information I provided is accurate and complete. Typing my name here is my signature on this form.";
const MAX_EXPORT_HISTORY = 50;
const DOWNLOAD_URL_SECONDS = 900;
const EXPORT = { PROCESSING: "processing", COMPLETED: "completed", FAILED: "failed" }; // same as model.template.js exportStatus

// 422 with the per-field list the form shows.
const answersError = (errors) => {
  const err = new ApiError(httpStatus.UNPROCESSABLE_ENTITY, errorType.BAD_REQUEST, "Please check the highlighted answers.");
  err.data = { errors };
  return err;
};

export const getSubmissionFor = async (id, accountId) => {
  const s = await submissionModel.getById(id);
  if (!s || s.accountId !== accountId) throw notFound();
  return s;
};

// What the dashboard sees: no hash, storage paths turned into links, link state summarised.
// Download links for completed exports (storage paths stay server-side), as for templates.
const withExportUrls = async (sub) => {
  const filename = `${(sub.title || sub.formName || "document").replace(/[^\w.\- ]+/g, "_")}.docx`;
  const exportHistory = await Promise.all(
    (sub.exportHistory ?? []).map(async ({ path, pdfPath, ...h }) => ({
      ...h,
      ...(pdfPath && h.pdfStatus === EXPORT.COMPLETED && (await pdfUrls(pdfPath, sub.title || sub.formName || "document"))),
      ...(path && h.processStatus === EXPORT.COMPLETED && {
        url: await getSignedUrl(getS3Client(), new GetObjectCommand({ Bucket: config.aws.s3Bucket, Key: path, ResponseContentDisposition: `attachment; filename="${filename}"` }), { expiresIn: DOWNLOAD_URL_SECONDS }),
      }),
    }))
  );
  return { ...sub, exportHistory };
};

const present = async (s) => {
  const { tokenHash, publicEmail, publicExpiresAt, publicLockedAt, ...rest } = await withExportUrls(await withUrls(s));
  return {
    ...rest,
    link: tokenHash ? { active: !publicLockedAt && Date.parse(publicExpiresAt) > Date.now(), expiresAt: publicExpiresAt, locked: !!publicLockedAt, email: publicEmail ?? null } : { active: false },
  };
};

export const listSubmissions = (accountId, { formId, status } = {}) =>
  submissionModel.getAllForAccount(accountId).then((rows) => rows.filter((r) => (!formId || r.formId === formId) && (!status || r.status === status)));

export const getSubmission = async (id, accountId) => present(await getSubmissionFor(id, accountId));

export const createSubmission = async ({ formId, title }, accountId, blameable) => {
  const form = await getFormFor(formId, accountId);
  if (form.status !== formStatus.PUBLISHED) throw badRequest("Publish the form before starting a submission.");
  const [plan, existing] = await Promise.all([getAccountPlan(accountId), submissionModel.getAllForAccount(accountId)]);
  assertNotSuspended(plan);
  if (existing.length >= plan.submissionLimit) {
    throw planLimitError(`${includesText(plan, "submissionLimit")} ${plan.submissionLimit} submissions. ${isTopPlan(plan) ? "Delete some first." : "Upgrade for more, or delete some first."}`);
  }
  const t = (title ?? "").trim();
  const created = await submissionModel.create(
    { accountId, formId, formName: form.name, formVersion: form.version, schema: form.schema, values: {}, attachments: [], exportHistory: [], title: t || undefined, keywordSearch: `${t} ${form.name}`.toLowerCase(), status: submissionStatus.DRAFT },
    blameable
  );
  return present(created);
};

// ---- attachments ---------------------------------------------------------------------------------

// Applies the form's list of files (per file field) and returns what to store.
const applyAttachments = async (sub, incoming) => {
  if (incoming === undefined) return { attachments: sub.attachments ?? [], removed: [] };
  const fileKeys = new Set(allFields(sub.schema).filter((f) => f.type === "file").map((f) => f.key));
  for (const i of incoming) if (!fileKeys.has(i.fieldKey)) throw badRequest(`"${i.fieldKey}" isn't a file field of this form.`);
  const attachments = [];
  const removed = [];
  for (const key of fileKeys) {
    const current = (sub.attachments ?? []).filter((a) => a.fieldKey === key);
    const next = incoming.filter((i) => i.fieldKey === key).map(({ fieldKey, ...rest }) => rest);
    const r = await commitAttachments(sub.accountId, sub.id, current, next);
    attachments.push(...r.attachments.map((a) => ({ ...a, fieldKey: key })));
    removed.push(...r.removed);
  }
  return { attachments, removed };
};

const fileValuesOf = (attachments) => {
  const out = {};
  for (const a of attachments) (out[a.fieldKey] ??= []).push(a.id);
  return out;
};

// ---- saving --------------------------------------------------------------------------------------

// Saves answers (and files) of a draft. Invalid answers are left out and reported, not saved.
const saveDraft = async (sub, { values, attachments: incomingFiles, title }, { audience, blameable }) => {
  const { attachments, removed } = await applyAttachments(sub, incomingFiles);
  const r = normalizeValues(sub.schema, values ?? sub.values ?? {}, { mode: "draft", audience, existing: sub.values ?? {}, fileValues: fileValuesOf(attachments) });
  const t = title !== undefined ? title.trim() : sub.title;
  await submissionModel.update(
    { id: sub.id, values: r.values, attachments, ...(t !== undefined && { title: t || undefined, keywordSearch: `${t ?? ""} ${sub.formName}`.toLowerCase() }) },
    blameable
  );
  await deleteAttachments(removed);
  return { errors: r.errors };
};

export const saveSubmission = async ({ id, ...body }, accountId, blameable) => {
  const sub = await getSubmissionFor(id, accountId);
  if (sub.status !== submissionStatus.DRAFT) throw badRequest("Reopen this submission to edit it.");
  assertNotSuspended(await getAccountPlan(accountId));
  const { errors } = await saveDraft(sub, body, { audience: "account", blameable });
  return { ...(await getSubmission(id, accountId)), errors };
};

export const attachmentUploadUrl = async ({ id, contentType }, accountId) => {
  const sub = await getSubmissionFor(id, accountId);
  if (sub.status !== submissionStatus.DRAFT) throw badRequest("Reopen this submission to add files.");
  return createUploadUrl(accountId, { contentType });
};

// ---- status ----------------------------------------------------------------------------------------

export const submit = async ({ id, ...body }, accountId, blameable) => {
  let sub = await getSubmissionFor(id, accountId);
  if (sub.status !== submissionStatus.DRAFT) throw badRequest("This submission has already been submitted.");
  assertNotSuspended(await getAccountPlan(accountId));
  if (body.values !== undefined || body.attachments !== undefined || body.title !== undefined) {
    await saveDraft(sub, body, { audience: "account", blameable });
    sub = await getSubmissionFor(id, accountId);
  }
  const r = normalizeValues(sub.schema, sub.values ?? {}, { mode: "submit", audience: "account", existing: sub.values ?? {}, fileValues: fileValuesOf(sub.attachments ?? []) });
  if (r.errors.length) throw answersError(r.errors);
  await submissionModel.update({ id, values: r.values, status: submissionStatus.SUBMITTED, submittedAt: new Date().toISOString(), submittedBy: blameable?.actionBy ?? null, decidedAt: null, decidedBy: null, decisionComment: null }, blameable);
  return getSubmission(id, accountId);
};

const decide = async (id, status, comment, accountId, blameable) => {
  const sub = await getSubmissionFor(id, accountId);
  if (sub.status !== submissionStatus.SUBMITTED) throw badRequest("Only a submitted form can be approved or rejected.");
  await submissionModel.update({ id, status, decidedAt: new Date().toISOString(), decidedBy: blameable?.actionBy ?? null, decisionComment: comment?.trim() || null }, blameable);
  return getSubmission(id, accountId);
};
export const approve = ({ id, comment }, accountId, blameable) => decide(id, submissionStatus.APPROVED, comment, accountId, blameable);
export const reject = ({ id, comment }, accountId, blameable) => decide(id, submissionStatus.REJECTED, comment, accountId, blameable);

export const reopen = async (id, accountId, blameable) => {
  const sub = await getSubmissionFor(id, accountId);
  if (sub.status === submissionStatus.DRAFT) throw badRequest("This submission is already a draft.");
  await submissionModel.update({ id, status: submissionStatus.DRAFT, decidedAt: null, decidedBy: null, decisionComment: null, publicLockedAt: null }, blameable);
  return getSubmission(id, accountId);
};

export const deleteSubmission = async (id, accountId, blameable) => {
  await getSubmissionFor(id, accountId);
  await submissionModel.remove(id, blameable);
  await deleteFolder(recordFolder(accountId, id));
};

export const countSubmissions = async (accountId) => (await submissionModel.getAllForAccount(accountId)).length;

// ---- customer links ------------------------------------------------------------------------------

const senderName = async (accountId) => {
  const a = await getAccountModel().get({ id: accountId });
  return [a?.firstName, a?.lastName].filter(Boolean).join(" ") || a?.email || "Someone";
};

// Makes (or replaces) the link. The token is returned once and never stored. Optionally emails it.
export const createLink = async ({ id, email, expiresInDays = 14 }, accountId, blameable) => {
  const sub = await getSubmissionFor(id, accountId);
  const form = await formModel.getById(sub.formId);
  if (!form?.settings?.publicEnabled) throw badRequest("Turn on customer links in the form's settings first.");
  if (sub.status !== submissionStatus.DRAFT) throw badRequest("Only a draft can be shared. Reopen it first.");
  assertNotSuspended(await getAccountPlan(accountId));
  const token = crypto.randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + expiresInDays * 86400000).toISOString();
  const cleanEmail = email?.trim() || undefined;
  await submissionModel.update({ id, tokenHash: hashToken(token), publicExpiresAt: expiresAt, publicEmail: cleanEmail ?? null, publicLockedAt: null }, blameable);
  const url = `${getFormsUrl()}/f/${token}`;
  let emailed = false;
  if (cleanEmail) {
    try {
      await sendEmail({ to: cleanEmail, ...formInviteEmail({ senderName: await senderName(accountId), title: sub.title || sub.formName, url, expiresAt }) });
      emailed = true;
    } catch (err) {
      console.error(JSON.stringify({ msg: "form invite email failed", submissionId: id, error: String(err?.message || err) }));
    }
  }
  return { url, expiresAt, emailed };
};

export const revokeLink = async (id, accountId, blameable) => {
  await getSubmissionFor(id, accountId);
  await submissionModel.removeLink(id, blameable);
  return getSubmission(id, accountId);
};

// A submission the token opens, or a generic 404 (never says why).
const resolveToken = async (token) => {
  const sub = await submissionModel.getByTokenHash(hashToken(token));
  if (!sub || sub.publicLockedAt || sub.status !== submissionStatus.DRAFT || !(Date.parse(sub.publicExpiresAt) > Date.now())) throw invalidLink();
  const form = await formModel.getById(sub.formId);
  if (!form?.settings?.publicEnabled) throw invalidLink();
  return { sub, form };
};

export const getPublic = async (token) => {
  const { sub, form } = await resolveToken(token);
  return {
    title: sub.title || sub.formName,
    formName: sub.formName,
    intro: form.settings?.intro ?? "",
    consentText: form.settings?.consentText || DEFAULT_CONSENT,
    schema: publicSchema(sub.schema),
    values: publicValues(sub.schema, sub.values),
    attachments: (sub.attachments ?? []).map(({ id, name, size, type, fieldKey }) => ({ id, name, size, type, fieldKey })),
    expiresAt: sub.publicExpiresAt,
  };
};

export const savePublic = async ({ token, ...body }, blameable) => {
  const { sub } = await resolveToken(token);
  const { errors } = await saveDraft(sub, { values: body.values, attachments: body.attachments }, { audience: "public", blameable });
  return { saved: true, errors };
};

export const publicUploadUrl = async ({ token, contentType }) => {
  const { sub } = await resolveToken(token);
  return createUploadUrl(sub.accountId, { contentType });
};

export const submitPublic = async ({ token, ...body }, client, blameable) => {
  let { sub, form } = await resolveToken(token);
  if (body.values !== undefined || body.attachments !== undefined) {
    await saveDraft(sub, { values: body.values, attachments: body.attachments }, { audience: "public", blameable });
    sub = await submissionModel.getById(sub.id);
  }
  const r = normalizeValues(sub.schema, sub.values ?? {}, { mode: "submit", audience: "public", existing: sub.values ?? {}, fileValues: fileValuesOf(sub.attachments ?? []) });
  if (r.errors.length) throw answersError(r.errors);
  const now = new Date().toISOString();
  const sigField = allFields(sub.schema).find((f) => f.type === "signature");
  const signature = {
    name: sigField ? r.values[sigField.key]?.name ?? null : null,
    at: now,
    ip: client?.ip ?? null,
    userAgent: client?.clientInfo ? JSON.stringify(client.clientInfo).slice(0, 300) : null,
    consentText: form.settings?.consentText || DEFAULT_CONSENT,
  };
  await submissionModel.update(
    { id: sub.id, values: r.values, status: submissionStatus.SUBMITTED, submittedAt: now, submittedBy: { name: "Customer (link)", email: sub.publicEmail ?? null }, signature, publicLockedAt: now },
    blameable
  );
  return { submitted: true, submittedAt: now };
};

// ---- documents ---------------------------------------------------------------------------------------

const markExportFailed = async (id, cbId, error) => {
  const s = await submissionModel.getById(id);
  const idx = (s?.exportHistory ?? []).findIndex((h) => h.cbId === cbId);
  if (idx < 0) return;
  await submissionModel.update({ id, exportHistory: s.exportHistory.map((h, i) => (i === idx ? { ...h, processStatus: EXPORT.FAILED, error } : h)) }, null);
};

// Starts a .docx export of the submission through its form's document template. Returns the
// submission with the new "processing" entry; the docx Lambda (backend/lambda/docxTemplate.js)
// completes it. A draft can be exported too (to review the layout) unless the form requires approval.
export const generateExport = async ({ id, pdf }, accountId, blameable) => {
  const sub = await getSubmissionFor(id, accountId);
  const form = await formModel.getById(sub.formId);
  if (!form?.templateId) throw badRequest("This form has no document template yet.");
  if (!exportsAllowed(sub, form)) throw badRequest("Approve the submission before exporting.");
  assertNotSuspended(await getAccountPlan(accountId));
  if (!config.docx?.lambdaName) throw new ApiError(httpStatus.SERVICE_UNAVAILABLE, errorType.BAD_REQUEST, "Document export isn't set up yet.");
  if ((sub.exportHistory?.length ?? 0) >= MAX_EXPORT_HISTORY) throw badRequest(`A submission keeps up to ${MAX_EXPORT_HISTORY} exports. Delete some old ones first.`);

  const cbId = Utils.ulid();
  const entry = { cbId, processStatus: EXPORT.PROCESSING, createdAt: new Date().toISOString(), createdBy: blameable?.actionBy ?? null, fileName: `${cbId}.docx`, ...(pdf && { pdf: true }) };
  await submissionModel.addExport(id, entry, blameable);
  try {
    await getLambdaClient().send(
      new InvokeCommand({
        FunctionName: config.docx.lambdaName,
        InvocationType: "Event", // async: the Lambda updates exportHistory when done
        Payload: Buffer.from(JSON.stringify({ submissionId: id, cbId, pdf: !!pdf })),
      })
    );
  } catch (err) {
    console.error(JSON.stringify({ msg: "docx invoke failed", submissionId: id, error: String(err?.message || err) }));
    await markExportFailed(id, cbId, "Could not start the export.");
    throw new ApiError(httpStatus.BAD_GATEWAY, errorType.BAD_REQUEST, "Could not start the export. Try again.");
  }
  return getSubmission(id, accountId);
};

// Removes one export entry and its file.
export const deleteExport = async (id, cbId, accountId, blameable) => {
  const sub = await getSubmissionFor(id, accountId);
  const hit = (sub.exportHistory ?? []).find((h) => h.cbId === cbId);
  if (!hit) throw notFound();
  await submissionModel.update({ id, exportHistory: sub.exportHistory.filter((h) => h.cbId !== cbId) }, blameable);
  if (hit.path) await deleteFolder(hit.path); // a single key, used as a prefix
  if (hit.pdfPath) await deleteFolder(hit.pdfPath);
  return getSubmission(id, accountId);
};

export const exportsAllowed = (sub, form) => !(form?.settings?.requireApprovedToExport && sub.status !== submissionStatus.APPROVED);
export { MAX_EXPORT_HISTORY, MASTER_ACCOUNT_ID };
