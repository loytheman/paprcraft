// Word -> PDF converter (the dashboard's "Word to PDF" page). No database record: the files are the
// state, under converter/<accountId>/<id>/ and deleted after a day (infra/28-attachments.sh).
//   1. createUpload: a presigned PUT for in.docx (the browser uploads straight to S3).
//   2. start: checks the upload and invokes the PDF Lambda (backend/lambda/pdfConvert.js) asynchronously.
//   3. status: out.pdf there -> completed (download + inline view links); failed.txt there -> failed;
//      neither -> still converting.
// Only .docx, up to MAX_BYTES. An id belongs to the account that made it: every key is built from
// the caller's own account id, so another account's id simply isn't found.
import httpStatus from "http-status";
import { InvokeCommand } from "@aws-sdk/client-lambda";
import { PutObjectCommand, HeadObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import config from "../config/config.js";
import Utils from "../helpers/utils.js";
import { getLambdaClient, getS3Client } from "./index.js";
import { ApiError, errorType } from "../middlewares/error.js";
import { customJoi as Joi } from "../models/customJoi.js";
import { assertNotSuspended, getAccountPlan } from "./service.plan.js";

export const MAX_BYTES = 10 * 1024 * 1024;
export const DOCX_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const UPLOAD_URL_SECONDS = 600;
const DOWNLOAD_URL_SECONDS = 900;
const ID = /^[0-9A-Z]{26}$/;

const bucket = () => config.aws.s3Bucket;
const folder = (accountId, id) => `converter/${accountId}/${id}/`;
const badRequest = (msg) => new ApiError(httpStatus.BAD_REQUEST, errorType.BAD_REQUEST, msg);
const notFound = () => new ApiError(httpStatus.NOT_FOUND, errorType.NOT_FOUND, "That conversion wasn't found. It may have expired.");
const head = async (Key) => {
  try {
    return await getS3Client().send(new HeadObjectCommand({ Bucket: bucket(), Key }));
  } catch (err) {
    if (err?.$metadata?.httpStatusCode === 404 || err?.name === "NotFound") return null;
    throw err;
  }
};
// The name the PDF downloads as: the Word file's name, tidied, with .pdf.
const pdfName = (name) => `${String(name ?? "document").replace(/\.docx$/i, "").replace(/[^\w.\- ]+/g, "_").trim().slice(0, 80) || "document"}.pdf`;

export const createUpload = async (accountId, { name, size }) => {
  assertNotSuspended(await getAccountPlan(accountId));
  if (!/\.docx$/i.test(name ?? "")) throw badRequest("Choose a Word document (.docx). Older .doc files need to be saved as .docx first.");
  if (!(size > 0)) throw badRequest("That file is empty.");
  if (size > MAX_BYTES) throw badRequest(`Files can be up to ${MAX_BYTES / 1024 / 1024} MB.`);
  const id = Utils.ulid();
  const key = `${folder(accountId, id)}in.docx`;
  const uploadUrl = await getSignedUrl(getS3Client(), new PutObjectCommand({ Bucket: bucket(), Key: key, ContentType: DOCX_TYPE }), { expiresIn: UPLOAD_URL_SECONDS, signableHeaders: new Set(["content-type"]) });
  return { id, uploadUrl, contentType: DOCX_TYPE, maxBytes: MAX_BYTES };
};

export const start = async (accountId, { id }) => {
  if (!config.pdf?.lambdaName) throw new ApiError(httpStatus.SERVICE_UNAVAILABLE, errorType.BAD_REQUEST, "PDF conversion isn't set up yet.");
  const docxPath = `${folder(accountId, id)}in.docx`;
  const found = await head(docxPath);
  if (!found) throw badRequest("The upload didn't finish. Choose the file again.");
  if (found.ContentLength > MAX_BYTES) throw badRequest(`Files can be up to ${MAX_BYTES / 1024 / 1024} MB.`);
  try {
    await getLambdaClient().send(new InvokeCommand({ FunctionName: config.pdf.lambdaName, InvocationType: "Event", Payload: Buffer.from(JSON.stringify({ direct: true, docxPath })) }));
  } catch (err) {
    console.error(JSON.stringify({ msg: "pdf invoke failed", error: String(err?.message || err) }));
    throw new ApiError(httpStatus.BAD_GATEWAY, errorType.BAD_REQUEST, "Could not start the conversion. Try again.");
  }
  return { id, status: "processing" };
};

export const status = async (accountId, { id, name }) => {
  const base = folder(accountId, id);
  if (!(await head(`${base}in.docx`))) throw notFound();
  if (await head(`${base}out.pdf`)) {
    const file = pdfName(name);
    const sign = (disposition) => getSignedUrl(getS3Client(), new GetObjectCommand({ Bucket: bucket(), Key: `${base}out.pdf`, ResponseContentType: "application/pdf", ResponseContentDisposition: `${disposition}; filename="${file}"` }), { expiresIn: DOWNLOAD_URL_SECONDS });
    return { id, status: "completed", fileName: file, url: await sign("attachment"), viewUrl: await sign("inline") };
  }
  if (await head(`${base}failed.txt`)) return { id, status: "failed", error: "This document couldn't be converted. Check that it opens in Word and try again." };
  return { id, status: "processing" };
};

export class ConverterJoiSchema {
  get uploadUrl() {
    return { name: Joi.string().max(255).required(), size: Joi.number().integer().min(1).required() };
  }

  get byId() {
    return { id: Joi.string().pattern(ID).required() };
  }

  get status() {
    return { id: Joi.string().pattern(ID).required(), name: Joi.string().max(255).allow("") };
  }
}
