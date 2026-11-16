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
// Deploy: yarn deploy-docx-template-stg|prod (backend/lambda). First-time create: infra/29-docx-template.sh.
const { render } = require('./docxRender');
const { flatten } = require('./formEngine');

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
  return {
    getItem: async (table, Key) => (await ddb.send(new GetCommand({ TableName: table, Key }))).Item ?? null,
    updateItem: (params) => ddb.send(new UpdateCommand(params)),
    putObject: (params) => s3.send(new PutObjectCommand(params)),
  };
};

const DOCX_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const keyOf = (templateId) => ({ pk: `#TEMPLATE:${templateId}`, sk: '#TEMPLATE#METADATA' });
const submissionKey = (id) => ({ pk: `#SUBMISSION:${id}`, sk: '#SUBMISSION#METADATA' });
const formKey = (id) => ({ pk: `#FORM:${id}`, sk: '#FORM#METADATA' });
const isConflict = (err) => err?.name === 'ConditionalCheckFailedException';

// Writes `fields` onto exportHistory[idx] where it is still the entry for cbId. The index is found
// by re-reading the item, so entries appended or removed meanwhile don't matter; one retry covers
// a concurrent change between the read and the write.
const patchExport = async (deps, table, key, cbId, fields) => {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const item = await deps.getItem(table, key);
    const idx = (item?.exportHistory ?? []).findIndex((h) => h.cbId === cbId);
    if (idx < 0) return false; // the export was deleted meanwhile
    const names = { '#h': 'exportHistory' };
    const vals = { ':cb': cbId };
    const sets = Object.entries(fields).map(([k, v], i) => {
      names[`#f${i}`] = k;
      vals[`:v${i}`] = v;
      return `#h[${idx}].#f${i} = :v${i}`;
    });
    try {
      await deps.updateItem({
        TableName: table,
        Key: key,
        UpdateExpression: `SET ${sets.join(', ')}`,
        ConditionExpression: `attribute_exists(pk) AND #h[${idx}].cbId = :cb`,
        ExpressionAttributeNames: names,
        ExpressionAttributeValues: vals,
      });
      return true;
    } catch (err) {
      if (!isConflict(err)) throw err;
    }
  }
  return false;
};

const docxBuffer = (template, values, formData) => require('docx').Packer.toBuffer(render(template, values ?? {}, formData));

// A template on its own.
const handleTemplate = async (deps, { templateId, cbId, values }) => {
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
const handleSubmission = async (deps, { submissionId, cbId, values }) => {
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
    const buffer = await docxBuffer(template, values, flatten(sub.schema, sub.values ?? {}));
    const path = `accounts/${sub.accountId}/records/${submissionId}/exports/${cbId}.docx`;
    await deps.putObject({ Bucket: bucket, Key: path, Body: buffer, ContentType: DOCX_TYPE });
    const patched = await patchExport(deps, table, submissionKey(submissionId), cbId, { processStatus: 'completed', path, fileName: `${cbId}.docx` });
    console.log(JSON.stringify({ msg: 'docx: done', submissionId, cbId, bytes: buffer.length, entryFound: patched }));
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
