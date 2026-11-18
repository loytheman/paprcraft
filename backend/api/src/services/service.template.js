// Document templates (model.template.js). Two owners share this code:
//   - an account's own templates (routes /templates, /template...): counted against templateLimit
//   - the staff-managed masters (MASTER_ACCOUNT_ID; routes under /staff/master-templates and
//     read-only /template-masters): any account can clone one into its own templates
// Generating a .docx: generateExport appends a "processing" entry to exportHistory and invokes the
// docx Lambda (backend/lambda/docxTemplate.js) asynchronously. The Lambda reads the template from
// DynamoDB, renders it, writes accounts/<accountId>/templates/<id>/exports/<cbId>.docx to the
// storage bucket and flips the entry to "completed" (or "failed"). exports live under the
// account's folder, so closing the account deletes them (service.accountClosure.js).
import httpStatus from "http-status";
import { InvokeCommand } from "@aws-sdk/client-lambda";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import config from "../config/config.js";
import Utils from "../helpers/utils.js";
import { getLambdaClient, getS3Client } from "./index.js";
import { ApiError, errorType, errorMessage } from "../middlewares/error.js";
import templateModel, { MASTER_ACCOUNT_ID, exportStatus } from "../models/model.template.js";
import { getAccountPlan, planLimitError, isTopPlan, includesText, assertNotSuspended } from "./service.plan.js";
import { deleteFolder } from "./service.attachment.js";
import { pdfUrls } from "./service.exportUrls.js";

const DOWNLOAD_URL_SECONDS = 900;
const MAX_EXPORT_HISTORY = 50;

const notFound = () => new ApiError(httpStatus.NOT_FOUND, errorType.NOT_FOUND, errorMessage.NOT_FOUND);
const badRequest = (msg) => new ApiError(httpStatus.BAD_REQUEST, errorType.BAD_REQUEST, msg);

export const templateFolder = (accountId, id) => `accounts/${accountId}/templates/${id}/`;
export const exportPath = (accountId, id, cbId) => `${templateFolder(accountId, id)}exports/${cbId}.docx`;

// Lower-cased text the keyword search looks in.
const keywordsOf = ({ name }) => String(name ?? "").toLowerCase();

const blankSections = () => [{ name: "section 1", list: [] }];

// A template of `ownerId`, or 404 (someone else's looks the same as a missing one).
export const getTemplateFor = async (id, ownerId) => {
  const t = await templateModel.getById(id);
  if (!t || t.accountId !== ownerId) throw notFound();
  return t;
};

// Download links for completed exports; storage paths stay server-side.
const withDownloadUrls = async (template) => {
  const history = template.exportHistory ?? [];
  const exportHistory = await Promise.all(
    history.map(async ({ path, pdfPath, ...h }) => ({
      ...h,
      ...(path && h.processStatus === exportStatus.COMPLETED && {
        url: await getSignedUrl(
          getS3Client(),
          new GetObjectCommand({ Bucket: config.aws.s3Bucket, Key: path, ResponseContentDisposition: `attachment; filename="${(template.name || "template").replace(/[^\w.\- ]+/g, "_")}.docx"` }),
          { expiresIn: DOWNLOAD_URL_SECONDS }
        ),
      }),
      ...(pdfPath && h.pdfStatus === exportStatus.COMPLETED && (await pdfUrls(pdfPath, template.name || "template"))),
    }))
  );
  return { ...template, exportHistory };
};

export const listTemplates = (ownerId) => templateModel.getAllForAccount(ownerId);

export const searchTemplates = async (ownerId, keyword = "") => {
  const needle = keyword.trim().toLowerCase();
  const rows = await templateModel.getAllForAccount(ownerId, { full: true });
  return rows.filter((t) => !needle || (t.keywordSearch ?? "").includes(needle)).map(({ section, exportHistory, ...row }) => row);
};

export const getTemplate = async (id, ownerId) => withDownloadUrls(await getTemplateFor(id, ownerId));

const assertUnderLimit = async (accountId) => {
  const [plan, own] = await Promise.all([getAccountPlan(accountId), templateModel.getAllForAccount(accountId)]);
  assertNotSuspended(plan);
  if (own.length >= plan.templateLimit) {
    throw planLimitError(`${includesText(plan, "templateLimit")} ${plan.templateLimit} templates. ${isTopPlan(plan) ? "Delete one first." : "Upgrade for more, or delete one first."}`);
  }
};

export const createTemplate = async ({ name, section, placeholders, formId, style, frame }, ownerId, blameable) => {
  if (ownerId !== MASTER_ACCOUNT_ID) await assertUnderLimit(ownerId);
  const data = { accountId: ownerId, name, section: section ?? blankSections(), placeholders: placeholders ?? {}, exportHistory: [], ...(formId && { formId }), ...(style && { style }), ...(frame && { frame }) };
  return templateModel.create({ ...data, keywordSearch: keywordsOf(data) }, blameable);
};

export const updateTemplate = async ({ id, ...fields }, ownerId, blameable) => {
  const current = await getTemplateFor(id, ownerId);
  await templateModel.update({ id, ...fields, keywordSearch: keywordsOf({ name: fields.name ?? current.name }) }, blameable);
  return getTemplate(id, ownerId);
};

export const deleteTemplate = async (id, ownerId, blameable) => {
  await getTemplateFor(id, ownerId);
  await templateModel.remove(id, blameable);
  if (ownerId !== MASTER_ACCOUNT_ID) await deleteFolder(templateFolder(ownerId, id));
};

// Copy of a template into `ownerId`'s own templates. `sourceOwnerId` is the account's own id (a
// plain copy) or MASTER_ACCOUNT_ID (cloning a master). The copy has no export history.
export const cloneTemplate = async (id, sourceOwnerId, ownerId, blameable) => {
  const src = await getTemplateFor(id, sourceOwnerId);
  const name = sourceOwnerId === ownerId ? `${src.name} (copy)` : src.name;
  return createTemplate({ name, section: src.section, placeholders: src.placeholders, style: src.style, frame: src.frame, formId: sourceOwnerId === ownerId ? src.formId : undefined }, ownerId, blameable); // a clone from a master is rebound by service.form.js cloneForm
};

// Starts a .docx export. Returns the template with the new "processing" entry.
export const generateExport = async ({ id, values, pdf }, accountId, blameable) => {
  if (accountId === MASTER_ACCOUNT_ID) throw badRequest("Master templates can't be exported. Clone one first.");
  const t = await getTemplateFor(id, accountId);
  assertNotSuspended(await getAccountPlan(accountId));
  if (!config.docx.lambdaName) throw new ApiError(httpStatus.SERVICE_UNAVAILABLE, errorType.BAD_REQUEST, "Document export isn't set up yet.");
  if ((t.exportHistory?.length ?? 0) >= MAX_EXPORT_HISTORY) throw badRequest(`A template keeps up to ${MAX_EXPORT_HISTORY} exports. Delete the template's old ones first.`);

  const cbId = Utils.ulid();
  const entry = { cbId, processStatus: exportStatus.PROCESSING, createdAt: new Date().toISOString(), createdBy: blameable?.actionBy ?? null, fileName: `${cbId}.docx`, ...(pdf && { pdf: true }) };
  await templateModel.addExport(id, entry, blameable);
  try {
    await getLambdaClient().send(
      new InvokeCommand({
        FunctionName: config.docx.lambdaName,
        InvocationType: "Event", // async: the Lambda updates exportHistory when done
        Payload: Buffer.from(JSON.stringify({ templateId: id, cbId, values: values ?? {}, pdf: !!pdf })),
      })
    );
  } catch (err) {
    console.error(JSON.stringify({ msg: "docx invoke failed", templateId: id, error: String(err?.message || err) }));
    await markExportFailed(id, cbId, "Could not start the export.");
    throw new ApiError(httpStatus.BAD_GATEWAY, errorType.BAD_REQUEST, "Could not start the export. Try again.");
  }
  return getTemplate(id, accountId);
};

const markExportFailed = async (id, cbId, error) => {
  const t = await templateModel.getById(id);
  const idx = (t?.exportHistory ?? []).findIndex((h) => h.cbId === cbId);
  if (idx < 0) return;
  const history = t.exportHistory.map((h, i) => (i === idx ? { ...h, processStatus: exportStatus.FAILED, error } : h));
  await templateModel.update({ id, exportHistory: history }, null);
};

// Removes one export entry and its file.
export const deleteExport = async (id, cbId, accountId, blameable) => {
  const t = await getTemplateFor(id, accountId);
  const hit = (t.exportHistory ?? []).find((h) => h.cbId === cbId);
  if (!hit) throw notFound();
  await templateModel.update({ id, exportHistory: t.exportHistory.filter((h) => h.cbId !== cbId) }, blameable);
  if (hit.path) await deleteFolder(hit.path); // a single key, used as a prefix
  if (hit.pdfPath) await deleteFolder(hit.pdfPath);
  return getTemplate(id, accountId);
};

export const countTemplates = async (accountId) => (await templateModel.getAllForAccount(accountId)).length;
