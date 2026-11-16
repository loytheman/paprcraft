// Document template -> .docx (backend/api service.template.js generateExport invokes this
// asynchronously with { templateId, cbId, values }).
//   1. Reads the Template item from the main table (env TABLE).
//   2. Renders it (docxRender.js) and writes accounts/<accountId>/templates/<templateId>/exports/<cbId>.docx
//      to the storage bucket (env BUCKET).
//   3. Sets the exportHistory entry the API added (matched by cbId) to "completed", or to "failed"
//      with a short, customer-safe message. It never throws after the item is found: an async
//      Lambda error is retried by AWS, which would render the same bad template twice more.
// Deploy: yarn deploy-docx-template-stg|prod (backend/lambda). First-time create: infra/29-docx-template.sh.
const { render } = require('./docxRender');

const FAILED_MESSAGE = 'Could not render the document. Check the template and try again.';

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
const isConflict = (err) => err?.name === 'ConditionalCheckFailedException';

// Writes `fields` onto exportHistory[idx] where it is still the entry for cbId. The index is found
// by re-reading the item, so entries appended or removed meanwhile don't matter; one retry covers
// a concurrent change between the read and the write.
const patchExport = async (deps, table, templateId, cbId, fields) => {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const item = await deps.getItem(table, keyOf(templateId));
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
        Key: keyOf(templateId),
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

const makeHandler = (injected) => async (event) => {
  const deps = injected ?? defaultDeps();
  const table = process.env.TABLE;
  const bucket = process.env.BUCKET;
  const { templateId, cbId, values } = event ?? {};
  if (!templateId || !cbId) {
    console.error(JSON.stringify({ msg: 'docx: missing templateId or cbId' }));
    return { ok: false };
  }

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
    const { Packer } = require('docx');
    const buffer = await Packer.toBuffer(render(template, values ?? {}));
    const path = `accounts/${template.accountId}/templates/${templateId}/exports/${cbId}.docx`;
    await deps.putObject({ Bucket: bucket, Key: path, Body: buffer, ContentType: DOCX_TYPE });
    const patched = await patchExport(deps, table, templateId, cbId, { processStatus: 'completed', path, fileName: `${cbId}.docx` });
    console.log(JSON.stringify({ msg: 'docx: done', templateId, cbId, bytes: buffer.length, entryFound: patched }));
    return { ok: true, path };
  } catch (err) {
    console.error(JSON.stringify({ msg: 'docx: failed', templateId, cbId, error: String(err?.message || err) }));
    try {
      await patchExport(deps, table, templateId, cbId, { processStatus: 'failed', error: FAILED_MESSAGE });
    } catch (e2) {
      console.error(JSON.stringify({ msg: 'docx: could not mark failed', templateId, cbId, error: String(e2?.message || e2) }));
    }
    return { ok: false };
  }
};

module.exports = { handler: makeHandler(), makeHandler };
