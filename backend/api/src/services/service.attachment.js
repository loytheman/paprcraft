// Image uploads attached to a record (e.g. screenshots). Pattern:
//   1. createUploadUrl: a presigned PUT (10 minutes) to tmp/<accountId>/<ulid>.<ext>, with the
//      content type signed in, so the browser uploads straight to S3 (never through the API).
//   2. On save of your record (in its own service), call commitAttachments: it checks each new
//      upload is the account's own and within size and type, copies it to the record's folder and
//      returns the list to store. Images dropped from the list are deleted after the save.
//   3. tmp/ expires after a day (backend/infra/28-attachments.sh), so uploads from a form that was
//      never saved clean themselves up.
//   4. Viewing: withUrls adds presigned GET links (15 minutes). There is no route that takes a raw
//      key, so an image is only reachable through its own record, after the account check.
// The browser shrinks images to WebP (or JPEG) before uploading; MAX_BYTES only catches what it
// couldn't. GIF and SVG are not accepted.
import httpStatus from "http-status";
import { PutObjectCommand, HeadObjectCommand, CopyObjectCommand, DeleteObjectsCommand, ListObjectsV2Command, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getS3Client } from "./index.js";
import config from "../config/config.js";
import Utils from "../helpers/utils.js";
import { ApiError, errorType } from "../middlewares/error.js";
import { customJoi as Joi } from "../models/customJoi.js";

export const MAX_ATTACHMENTS = 5;
export const MAX_BYTES = 10 * 1024 * 1024;
export const IMAGE_TYPES = { "image/webp": "webp", "image/jpeg": "jpg", "image/png": "png" };
// What uploads accept: images, plus PDF (documents attached to a form submission).
export const FILE_TYPES = { ...IMAGE_TYPES, "application/pdf": "pdf" };
const UPLOAD_URL_SECONDS = 600;
const VIEW_URL_SECONDS = 900;

const bucket = () => config.aws.s3Bucket;
const s3 = () => getS3Client();
const badRequest = (msg) => new ApiError(httpStatus.BAD_REQUEST, errorType.BAD_REQUEST, msg);

const tmpPrefix = (accountId) => `tmp/${accountId}/`;
export const recordFolder = (accountId, recordId) => `accounts/${accountId}/records/${recordId}/`;
export const accountFolder = (accountId) => `accounts/${accountId}/`;
const TMP_KEY = /^tmp\/[^/]+\/[0-9A-Z]{26}\.(webp|jpg|png|pdf)$/;

// A display name for the image (the user's file name, tidied); never used in a key.
const cleanName = (name) => String(name ?? "").replace(/[\u0000-\u001f]/g, "").trim().slice(0, 120) || "image";

// Step 1: where the browser uploads one image.
export const createUploadUrl = async (accountId, { contentType }) => {
  const ext = FILE_TYPES[contentType];
  if (!ext) throw badRequest("Files must be PNG, JPEG, WebP or PDF.");
  const key = `${tmpPrefix(accountId)}${Utils.ulid()}.${ext}`;
  // signableHeaders: S3 then refuses an upload whose Content-Type differs from the one signed here.
  const uploadUrl = await getSignedUrl(s3(), new PutObjectCommand({ Bucket: bucket(), Key: key, ContentType: contentType }), { expiresIn: UPLOAD_URL_SECONDS, signableHeaders: new Set(["content-type"]) });
  return { uploadUrl, key, contentType, maxBytes: MAX_BYTES };
};

// Step 2, on save. current = what the record has; incoming = the form's list, in display order:
// { id } keeps an existing image, { key, name } adds a new upload. undefined = leave them alone.
// -> { attachments: the list to store, removed: stored images to delete once the save succeeded }
export const commitAttachments = async (accountId, recordId, current = [], incoming) => {
  if (incoming === undefined) return { attachments: current, removed: [] };
  if (incoming.length > MAX_ATTACHMENTS) throw badRequest(`A record can have up to ${MAX_ATTACHMENTS} images.`);
  const byId = new Map(current.map((a) => [a.id, a]));
  const attachments = [];
  for (const item of incoming) {
    if (item.id) {
      const kept = byId.get(item.id);
      if (!kept) throw badRequest("One of the images no longer exists. Reload the page and try again.");
      attachments.push(kept);
      continue;
    }
    const { key } = item;
    if (!TMP_KEY.test(key) || !key.startsWith(tmpPrefix(accountId))) throw badRequest("That upload isn't yours or has expired. Add the image again.");
    let head;
    try {
      head = await s3().send(new HeadObjectCommand({ Bucket: bucket(), Key: key }));
    } catch (err) {
      if (err?.$metadata?.httpStatusCode === 404 || err?.name === "NotFound") throw badRequest("An image upload didn't finish or has expired. Add it again.");
      throw err;
    }
    const ext = FILE_TYPES[head.ContentType];
    if (!ext) throw badRequest("Files must be PNG, JPEG, WebP or PDF.");
    if (head.ContentLength > MAX_BYTES) throw badRequest(`Each file can be up to ${MAX_BYTES / 1024 / 1024} MB.`);
    const id = Utils.ulid();
    const path = `${recordFolder(accountId, recordId)}${id}.${ext}`;
    await s3().send(new CopyObjectCommand({ Bucket: bucket(), CopySource: `${bucket()}/${key}`, Key: path }));
    attachments.push({ id, path, name: cleanName(item.name), size: head.ContentLength, type: head.ContentType, addedAt: new Date().toISOString() });
  }
  const keptIds = new Set(attachments.map((a) => a.id));
  return { attachments, removed: current.filter((a) => !keptIds.has(a.id)) };
};

const deleteKeys = async (keys) => {
  for (let i = 0; i < keys.length; i += 1000) {
    const Objects = keys.slice(i, i + 1000).map((Key) => ({ Key }));
    if (Objects.length) await s3().send(new DeleteObjectsCommand({ Bucket: bucket(), Delete: { Objects, Quiet: true } }));
  }
};

// Never fails the request that called it: a leftover file is harmless, a failed save isn't.
export const deleteAttachments = async (list = []) => {
  try {
    await deleteKeys(list.map((a) => a.path).filter(Boolean));
  } catch (err) {
    console.error(JSON.stringify({ msg: "attachment delete failed", error: String(err?.message || err) }));
  }
};

// A deleted record or a closed account: everything under its folder.
export const deleteFolder = async (prefix) => {
  try {
    let ContinuationToken;
    do {
      const r = await s3().send(new ListObjectsV2Command({ Bucket: bucket(), Prefix: prefix, ContinuationToken }));
      await deleteKeys((r.Contents ?? []).map((o) => o.Key));
      ContinuationToken = r.IsTruncated ? r.NextContinuationToken : undefined;
    } while (ContinuationToken);
  } catch (err) {
    console.error(JSON.stringify({ msg: "attachment folder delete failed", prefix, error: String(err?.message || err) }));
  }
};

// Step 4: the record as the dashboard sees it. Storage paths stay server-side.
export const withUrls = async (record) => {
  if (!record?.attachments?.length) return record;
  const attachments = await Promise.all(record.attachments.map(async ({ path, ...a }) => ({
    ...a,
    url: await getSignedUrl(s3(), new GetObjectCommand({ Bucket: bucket(), Key: path }), { expiresIn: VIEW_URL_SECONDS }),
  })));
  return { ...record, attachments };
};

export class AttachmentJoiSchema {
  get uploadUrl() {
    return { contentType: Joi.string().valid(...Object.keys(FILE_TYPES)).required() };
  }
}
