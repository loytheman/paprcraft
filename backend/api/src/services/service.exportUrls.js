import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import config from "../config/config.js";
import { getS3Client } from "./index.js";

const DOWNLOAD_URL_SECONDS = 900;

// A PDF's links: one that downloads and one that the browser shows inline (the preview).
export const pdfUrls = async (pdfPath, name) => {
  const file = `${String(name).replace(/[^\w.\- ]+/g, "_")}.pdf`;
  const sign = (disposition) => getSignedUrl(getS3Client(), new GetObjectCommand({ Bucket: config.aws.s3Bucket, Key: pdfPath, ResponseContentType: "application/pdf", ResponseContentDisposition: `${disposition}; filename="${file}"` }), { expiresIn: DOWNLOAD_URL_SECONDS });
  return { pdfUrl: await sign("attachment"), pdfViewUrl: await sign("inline") };
};
