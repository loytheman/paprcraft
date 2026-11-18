// .docx -> .pdf with LibreOffice. Runs as a container-image Lambda (backend/lambda/pdf/Dockerfile,
// infra/30-pdf-convert.sh). The docx Lambda invokes it asynchronously once a document is ready and
// the export asked for a PDF:
//   { recordKey: { pk, sk }, cbId, docxPath }
//   1. Reads the .docx from the storage bucket (env BUCKET), converts it, writes the PDF next to it
//      (same key with .pdf).
//   2. Sets pdfStatus on the exportHistory entry (matched by cbId) to "completed" (+ pdfPath) or
//      "failed" (+ a customer-safe pdfError). It never throws once it has the payload: the .docx is
//      already usable, and a retry would only repeat a bad conversion.
const { patchExport } = require('./exportEntry');

const FAILED_MESSAGE = 'Could not create the PDF. The Word file is still available.';
const PDF_TYPE = 'application/pdf';

const defaultDeps = () => {
  const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
  const { DynamoDBDocumentClient, GetCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
  const { S3Client, GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');
  const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
  const s3 = new S3Client({});
  return {
    getItem: async (table, Key) => (await ddb.send(new GetCommand({ TableName: table, Key }))).Item ?? null,
    updateItem: (params) => ddb.send(new UpdateCommand(params)),
    getObject: async (Bucket, Key) => Buffer.from(await (await s3.send(new GetObjectCommand({ Bucket, Key }))).Body.transformToByteArray()),
    putObject: (params) => s3.send(new PutObjectCommand(params)),
    convert: libreOfficeConvert,
  };
};

// LibreOffice can't count pages "in this section" (Word's SECTIONPAGES field) and prints nothing, so
// for the PDF only, headers and footers count the pages of the whole file (NUMPAGES). The Word file
// itself is never changed.
async function forLibreOffice(docx) {
  const JSZip = require('jszip');
  const zip = await JSZip.loadAsync(docx);
  let changed = false;
  for (const name of Object.keys(zip.files).filter((n) => /^word\/(header|footer)\d*\.xml$/.test(n))) {
    const xml = await zip.file(name).async('string');
    if (xml.includes('SECTIONPAGES')) { zip.file(name, xml.replace(/SECTIONPAGES/g, 'NUMPAGES')); changed = true; }
  }
  return changed ? zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }) : docx;
}

// docx bytes in, pdf bytes out. A private profile dir per run under /tmp (the only writable path).
async function libreOfficeConvert(docx) {
  const fs = require('fs/promises');
  const os = require('os');
  const path = require('path');
  const { execFile } = require('child_process');
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'pdf-'));
  try {
    const input = path.join(dir, 'in.docx');
    await fs.writeFile(input, await forLibreOffice(docx).catch(() => docx));
    await new Promise((resolve, reject) => {
      execFile(
        'soffice',
        ['--headless', '--norestore', '--nolockcheck', `-env:UserInstallation=file://${dir}/profile`, '--convert-to', 'pdf:writer_pdf_Export', '--outdir', dir, input],
        { timeout: 100000, env: { ...process.env, HOME: dir } },
        (err, _out, stderr) => (err ? reject(new Error(`${err.message} ${stderr || ''}`.trim())) : resolve())
      );
    });
    return await fs.readFile(path.join(dir, 'in.pdf'));
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

const makeHandler = (injected) => async (event) => {
  const { recordKey, cbId, docxPath } = event ?? {};
  if (!recordKey?.pk || !recordKey?.sk || !cbId || !docxPath) {
    console.error(JSON.stringify({ msg: 'pdf: bad payload' }));
    return { ok: false };
  }
  const deps = injected ?? defaultDeps();
  const table = process.env.TABLE;
  const bucket = process.env.BUCKET;
  const pdfPath = docxPath.replace(/\.docx$/i, '.pdf');
  try {
    const docx = await deps.getObject(bucket, docxPath);
    const pdf = await deps.convert(docx);
    if (!pdf?.length) throw new Error('empty PDF');
    await deps.putObject({ Bucket: bucket, Key: pdfPath, Body: pdf, ContentType: PDF_TYPE });
    const found = await patchExport(deps, table, recordKey, cbId, { pdfStatus: 'completed', pdfPath });
    console.log(JSON.stringify({ msg: 'pdf: done', cbId, bytes: pdf.length, entryFound: found }));
    return { ok: true, pdfPath };
  } catch (err) {
    console.error(JSON.stringify({ msg: 'pdf: failed', cbId, error: String(err?.message || err).slice(0, 500) }));
    try {
      await patchExport(deps, table, recordKey, cbId, { pdfStatus: 'failed', pdfError: FAILED_MESSAGE });
    } catch (e2) {
      console.error(JSON.stringify({ msg: 'pdf: could not mark failed', cbId, error: String(e2?.message || e2) }));
    }
    return { ok: false };
  }
};

module.exports = { handler: makeHandler(), makeHandler, libreOfficeConvert, forLibreOffice };
