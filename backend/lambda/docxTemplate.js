// Document -> .docx. The API invokes this asynchronously (backend/api service.template.js and
// service.submission.js generateExport) with one of:
//   { templateId, cbId, values }   a template on its own (placeholders from values + the template)
//   { submissionId, cbId, values? } a form submission rendered through its form's template: the
//      Submission item gives the answers (flattened with the form engine, using the schema snapshot
//      it was filled against), its Form gives `templateId`, and the template is rendered with them.
//   1. Reads the items from the main table (env TABLE).
//   2. Renders (docxRender.js) and writes the file to the storage bucket (env BUCKET):
//        accounts/<accountId>/templates/<templateId>/exports/<cbId>.docx
//        accounts/<accountId>/records/<submissionId>/exports/<cbId>.docx
//   3. Sets the exportHistory entry the API added (on the Template or the Submission, matched by
//      cbId) to "completed", or to "failed" with a short, customer-safe message. It never throws
//      after the item is found: an async Lambda error is retried by AWS, which would render the same
//      bad document twice more.
//   4. If the payload says `pdf: true`, hands the finished file to the PDF converter Lambda (pdfConvert.js).
// Deploy: yarn deploy-docx-template-stg|prod (backend/lambda). First-time create: infra/29-docx-template.sh.
const { render } = require('./docxRender');
const { flatten } = require('./formEngine');
const { keyOf, submissionKey, formKey, patchExport } = require('./exportEntry');

const FAILED_MESSAGE = 'Could not render the document. Check the template and try again.';
const NO_TEMPLATE_MESSAGE = 'This form has no document template yet.';
const TEMPLATE_GONE_MESSAGE = "The form's document template isn't available.";

// AWS SDK v3 ships with the Node Lambda runtime; locally it comes from devDependencies. Loaded on
// first use so tests can inject fakes without the SDK.
const defaultDeps = () => {
  const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
  const { DynamoDBDocumentClient, GetCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
  const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
  const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
  const s3 = new S3Client({});
  const { LambdaClient, InvokeCommand } = require('@aws-sdk/client-lambda');
  const lambda = new LambdaClient({});
  return {
    getItem: async (table, Key) => (await ddb.send(new GetCommand({ TableName: table, Key }))).Item ?? null,
    updateItem: (params) => ddb.send(new UpdateCommand(params)),
    putObject: (params) => s3.send(new PutObjectCommand(params)),
    invokeAsync: (FunctionName, payload) => lambda.send(new InvokeCommand({ FunctionName, InvocationType: 'Event', Payload: Buffer.from(JSON.stringify(payload)) })),
  };
};

const DOCX_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const docxBuffer = (template, values, formData) => require('docx').Packer.toBuffer(render(template, values ?? {}, formData));

// When the export asked for a PDF: marks it "processing" and hands the finished .docx to the PDF
// converter Lambda (env PDF_LAMBDA_NAME). Never fails the export: the Word file is already done.
const startPdf = async (deps, table, key, cbId, docxPath, wanted) => {
  if (!wanted) return;
  const fn = process.env.PDF_LAMBDA_NAME;
  try {
    if (!fn) throw new Error('PDF_LAMBDA_NAME is not set');
    await patchExport(deps, table, key, cbId, { pdfStatus: 'processing' });
    await deps.invokeAsync(fn, { recordKey: key, cbId, docxPath });
  } catch (err) {
    console.error(JSON.stringify({ msg: 'docx: could not start pdf', cbId, error: String(err?.message || err) }));
    try { await patchExport(deps, table, key, cbId, { pdfStatus: 'failed', pdfError: 'Could not create the PDF. The Word file is still available.' }); } catch { /* nothing more to do */ }
  }
};

// A template on its own.
const handleTemplate = async (deps, { templateId, cbId, values, pdf }) => {
  const table = process.env.TABLE;
  const bucket = process.env.BUCKET;
  let template;
  try {
    template = await deps.getItem(table, keyOf(templateId));
  } catch (err) {
    console.error(JSON.stringify({ msg: 'docx: read failed', templateId, error: String(err?.message || err) }));
    throw err; // nothing was changed: let AWS retry
  }
  if (!template) {
    console.error(JSON.stringify({ msg: 'docx: template not found', templateId }));
    return { ok: false };
  }

  try {
    const buffer = await docxBuffer(template, values);
    const path = `accounts/${template.accountId}/templates/${templateId}/exports/${cbId}.docx`;
    await deps.putObject({ Bucket: bucket, Key: path, Body: buffer, ContentType: DOCX_TYPE });
    const patched = await patchExport(deps, table, keyOf(templateId), cbId, { processStatus: 'completed', path, fileName: `${cbId}.docx` });
    console.log(JSON.stringify({ msg: 'docx: done', templateId, cbId, bytes: buffer.length, entryFound: patched }));
    if (patched) await startPdf(deps, table, keyOf(templateId), cbId, path, pdf);
    return { ok: true, path };
  } catch (err) {
    console.error(JSON.stringify({ msg: 'docx: failed', templateId, cbId, error: String(err?.message || err) }));
    try {
      await patchExport(deps, table, keyOf(templateId), cbId, { processStatus: 'failed', error: FAILED_MESSAGE });
    } catch (e2) {
      console.error(JSON.stringify({ msg: 'docx: could not mark failed', templateId, cbId, error: String(e2?.message || e2) }));
    }
    return { ok: false };
  }
};

// A form submission, through its form's template.
const handleSubmission = async (deps, { submissionId, cbId, values, pdf }) => {
  const table = process.env.TABLE;
  const bucket = process.env.BUCKET;
  let sub;
  try {
    sub = await deps.getItem(table, submissionKey(submissionId));
  } catch (err) {
    console.error(JSON.stringify({ msg: 'docx: read failed', submissionId, error: String(err?.message || err) }));
    throw err;
  }
  if (!sub) {
    console.error(JSON.stringify({ msg: 'docx: submission not found', submissionId }));
    return { ok: false };
  }

  const fail = async (message, error) => {
    console.error(JSON.stringify({ msg: 'docx: failed', submissionId, cbId, error: String(error?.message || error || message) }));
    try {
      await patchExport(deps, table, submissionKey(submissionId), cbId, { processStatus: 'failed', error: message });
    } catch (e2) {
      console.error(JSON.stringify({ msg: 'docx: could not mark failed', submissionId, cbId, error: String(e2?.message || e2) }));
    }
    return { ok: false };
  };

  let template;
  try {
    const form = await deps.getItem(table, formKey(sub.formId));
    if (!form?.templateId) return await fail(NO_TEMPLATE_MESSAGE);
    template = await deps.getItem(table, keyOf(form.templateId));
    // A template of another account is never rendered with this account's answers.
    if (!template || template.accountId !== sub.accountId) return await fail(TEMPLATE_GONE_MESSAGE);
  } catch (err) {
    return fail(FAILED_MESSAGE, err);
  }

  try {
    // Built-in values every template can use ({{submission_ref}}...); the caller's own values win.
    const builtins = { submission_ref: String(submissionId).slice(-8).toUpperCase(), submission_title: sub.title || sub.formName || '', form_name: sub.formName || '' };
    const buffer = await docxBuffer(template, { ...builtins, ...(values ?? {}) }, flatten(sub.schema, sub.values ?? {}));
    const path = `accounts/${sub.accountId}/records/${submissionId}/exports/${cbId}.docx`;
    await deps.putObject({ Bucket: bucket, Key: path, Body: buffer, ContentType: DOCX_TYPE });
    const patched = await patchExport(deps, table, submissionKey(submissionId), cbId, { processStatus: 'completed', path, fileName: `${cbId}.docx` });
    console.log(JSON.stringify({ msg: 'docx: done', submissionId, cbId, bytes: buffer.length, entryFound: patched }));
    if (patched) await startPdf(deps, table, submissionKey(submissionId), cbId, path, pdf);
    return { ok: true, path };
  } catch (err) {
    return fail(FAILED_MESSAGE, err);
  }
};

const makeHandler = (injected) => async (event) => {
  const deps = injected ?? defaultDeps();
  const { templateId, submissionId, cbId } = event ?? {};
  if (!cbId || (!templateId && !submissionId)) {
    console.error(JSON.stringify({ msg: 'docx: missing templateId/submissionId or cbId' }));
    return { ok: false };
  }
  return submissionId ? handleSubmission(deps, event) : handleTemplate(deps, event);
};

module.exports = { handler: makeHandler(), makeHandler };
