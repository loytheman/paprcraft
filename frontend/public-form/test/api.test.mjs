// The customer form app's API client (src/api.js) with a fake fetch: link parsing, the ways a call
// fails, the attachment shapes sent to the API, and the two-step upload.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FormLinkError, makeApi, tokenFromPath } from '../src/api.js';

const TOKEN = 'abcdefghijklmnopqrstuvwxyz0123456789_-ABCDE';
const reply = (status, body) => async () => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const recorder = (responses) => {
  const calls = [];
  const fetchFn = async (url, init) => { calls.push({ url, init }); return responses.shift()(url, init); };
  return { calls, fetchFn };
};
const kindOf = async (p) => p.then(() => 'ok', (e) => (e instanceof FormLinkError ? e.kind : `other:${e}`));

test('tokenFromPath only accepts /f/<token>', () => {
  assert.equal(tokenFromPath(`/f/${TOKEN}`), TOKEN);
  assert.equal(tokenFromPath(`/f/${TOKEN}/`), TOKEN);
  for (const p of ['/', '/f/', '/f/short', `/x/${TOKEN}`, `/f/${TOKEN}/more`]) assert.equal(tokenFromPath(p), '');
});

test('calls send no cookies and unwrap the success envelope', async () => {
  const { calls, fetchFn } = recorder([reply(200, { status: 'success', data: { title: 'CDD' } })]);
  const api = makeApi('https://api.test/v1', fetchFn);
  assert.deepEqual(await api.getForm(TOKEN), { title: 'CDD' });
  assert.equal(calls[0].url, `https://api.test/v1/form-link/${TOKEN}`);
  assert.equal(calls[0].init.credentials, 'omit');
  assert.equal(calls[0].init.method, 'GET');
});

test('failures map to a kind the screens switch on', async () => {
  const run = (res) => kindOf(makeApi('https://api.test/v1', recorder([res]).fetchFn).getForm(TOKEN));
  assert.equal(await run(reply(404, { status: 'fail', message: "This link isn't valid or has expired." })), 'invalid');
  assert.equal(await run(reply(400, { status: 'fail' })), 'invalid'); // a malformed token
  assert.equal(await run(reply(429, { status: 'fail', message: 'Too many requests.' })), 'rate');
  assert.equal(await run(reply(500, { status: 'error' })), 'server');
  assert.equal(await run(async () => { throw new TypeError('Failed to fetch'); }), 'network');
});

test('a 422 carries the per-field errors', async () => {
  const errors = [{ key: 'full_name', message: 'This is required.' }, { key: 'owners', row: 0, field: 'name', message: 'This is required.' }];
  const api = makeApi('https://api.test/v1', recorder([reply(422, { status: 'fail', message: 'Please check the highlighted answers.', data: { errors } })]).fetchFn);
  const e = await api.submit(TOKEN, {}, []).catch((x) => x);
  assert.equal(e.kind, 'validation');
  assert.deepEqual(e.errors, errors);
});

test('drafts and submissions send saved files by id and new uploads by key', async () => {
  const { calls, fetchFn } = recorder([reply(200, { status: 'success', data: { saved: true, errors: [] } }), reply(200, { status: 'success', data: { submitted: true } })]);
  const api = makeApi('https://api.test/v1', fetchFn);
  const files = [{ id: 'A1', name: 'a.pdf', size: 5, fieldKey: 'id_copy', url: 'x' }, { key: 'tmp/A/X.pdf', name: 'b.pdf', size: 9, fieldKey: 'id_copy' }];
  await api.saveDraft(TOKEN, { full_name: 'Ann' }, files);
  await api.submit(TOKEN, { full_name: 'Ann' }, files);
  const expected = [{ id: 'A1', fieldKey: 'id_copy' }, { key: 'tmp/A/X.pdf', name: 'b.pdf', fieldKey: 'id_copy' }];
  assert.equal(calls[0].init.method, 'PUT');
  assert.deepEqual(JSON.parse(calls[0].init.body), { values: { full_name: 'Ann' }, attachments: expected });
  assert.equal(calls[1].url, `https://api.test/v1/form-link/${TOKEN}/submit`);
  assert.deepEqual(JSON.parse(calls[1].init.body).attachments, expected);
});

test('upload asks for a presigned URL, PUTs the file there, and returns its temporary key', async () => {
  const file = { name: 'id.pdf', type: 'application/pdf', size: 3 };
  const { calls, fetchFn } = recorder([reply(200, { status: 'success', data: { uploadUrl: 'https://s3.test/put', key: 'tmp/A/K.pdf' } }), reply(200, {})]);
  const out = await makeApi('https://api.test/v1', fetchFn).upload(TOKEN, file);
  assert.deepEqual(out, { key: 'tmp/A/K.pdf', name: 'id.pdf' });
  assert.deepEqual(JSON.parse(calls[0].init.body), { contentType: 'application/pdf' });
  assert.equal(calls[1].url, 'https://s3.test/put');
  assert.equal(calls[1].init.method, 'PUT');
  assert.equal(calls[1].init.headers['Content-Type'], 'application/pdf');
  assert.equal(calls[1].init.body, file);
});

test('a failed S3 upload is reported, not swallowed', async () => {
  const { fetchFn } = recorder([reply(200, { status: 'success', data: { uploadUrl: 'https://s3.test/put', key: 'k' } }), reply(403, {})]);
  assert.equal(await kindOf(makeApi('https://api.test/v1', fetchFn).upload(TOKEN, { name: 'a.pdf', type: 'application/pdf' })), 'server');
});
