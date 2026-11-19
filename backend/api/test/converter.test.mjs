// Word -> PDF converter service (service.converter.js): upload rules, start, and the polling states.
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
const u = (p) => new URL('../src/' + p, import.meta.url).href;

const invokes = [];
let files = {}; // key -> { ContentLength }
const config = { aws: { s3Bucket: 'b' }, pdf: { lambdaName: 'pdf-fn' } };
mock.module(u('config/config.js'), { defaultExport: config });
mock.module(u('helpers/utils.js'), { defaultExport: { ulid: () => '01ARZ3NDEKTSV4RRFFQ69G5FAV' } });
mock.module(u('services/index.js'), { namedExports: {
  getLambdaClient: () => ({ send: async (c) => invokes.push(JSON.parse(c.input.Payload.toString())) }),
  getS3Client: () => ({ send: async (c) => {
    const f = files[c.input.Key];
    if (c.constructor.name === 'HeadObjectCommand') { if (!f) throw Object.assign(new Error('nf'), { name: 'NotFound' }); return f; }
    return {};
  } }),
} });
mock.module('@aws-sdk/client-lambda', { namedExports: { InvokeCommand: class { constructor(input) { this.input = input; } } } });
mock.module('@aws-sdk/client-s3', { namedExports: {
  PutObjectCommand: class { constructor(input) { this.input = input; } },
  HeadObjectCommand: class HeadObjectCommand { constructor(input) { this.input = input; } },
  GetObjectCommand: class { constructor(input) { this.input = input; } },
} });
mock.module('@aws-sdk/s3-request-presigner', { namedExports: { getSignedUrl: async (c, cmd) => `https://s3.test/${cmd.input.Key}?${cmd.input.ResponseContentDisposition ?? 'put'}` } });
mock.module(u('services/service.plan.js'), { namedExports: { getAccountPlan: async () => ({}), assertNotSuspended: () => {} } });
mock.module(u('middlewares/error.js'), { namedExports: {
  errorType: {}, ApiError: class extends Error { constructor(s, c, m) { super(m); this.statusCode = s; } },
} });

const svc = await import(u('services/service.converter.js'));
const ID = '01ARZ3NDEKTSV4RRFFQ69G5FAV';
const base = `converter/A1/${ID}/`;
const reset = () => { files = {}; invokes.length = 0; config.pdf.lambdaName = 'pdf-fn'; };

test('upload: only .docx, non-empty, up to the size cap; the key is inside the caller\'s own folder', async () => {
  reset();
  const ok = await svc.createUpload('A1', { name: 'Contract.DOCX', size: 1000 });
  assert.equal(ok.id, ID);
  assert.ok(ok.uploadUrl.startsWith(`https://s3.test/${base}in.docx`));
  await assert.rejects(svc.createUpload('A1', { name: 'old.doc', size: 10 }), /\.docx/);
  await assert.rejects(svc.createUpload('A1', { name: 'a.docx', size: 0 }), /empty/);
  await assert.rejects(svc.createUpload('A1', { name: 'a.docx', size: svc.MAX_BYTES + 1 }), /MB/);
});

test('start: needs the finished upload, then invokes the PDF Lambda with the path', async () => {
  reset();
  await assert.rejects(svc.start('A1', { id: ID }), /didn't finish/);
  files[`${base}in.docx`] = { ContentLength: 500 };
  const out = await svc.start('A1', { id: ID });
  assert.equal(out.status, 'processing');
  assert.deepEqual(invokes, [{ direct: true, docxPath: `${base}in.docx` }]);
  await assert.rejects(svc.start('A2', { id: ID }), /didn't finish/); // another account's id is not found
  config.pdf.lambdaName = '';
  await assert.rejects(svc.start('A1', { id: ID }), /isn't set up/);
});

test('status: processing, then completed with links named after the Word file, or failed', async () => {
  reset();
  await assert.rejects(svc.status('A1', { id: ID }), /wasn't found/);
  files[`${base}in.docx`] = { ContentLength: 500 };
  assert.equal((await svc.status('A1', { id: ID })).status, 'processing');
  files[`${base}failed.txt`] = {};
  assert.equal((await svc.status('A1', { id: ID })).status, 'failed');
  delete files[`${base}failed.txt`];
  files[`${base}out.pdf`] = {};
  const done = await svc.status('A1', { id: ID, name: 'My: contract.docx' });
  assert.equal(done.status, 'completed');
  assert.equal(done.fileName, 'My_ contract.pdf');
  assert.ok(done.url.includes('attachment') && done.viewUrl.includes('inline'));
});
