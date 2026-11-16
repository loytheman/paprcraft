// Submissions UI helpers (src/helpers/forms/submission.js): status chips, what each role can do,
// the 422 mapping, attachment payloads, autosave reconciliation, link state, generate gating.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as S from '../src/helpers/forms/submission.js';

test('every status has a label and tone', () => {
  assert.deepEqual(S.STATUSES.map((s) => S.statusMeta(s).tone), ['info', 'warn', 'ok', 'down']);
  assert.equal(S.statusMeta('submitted').label, 'Submitted');
  assert.equal(S.statusMeta('weird').label, 'weird');
});

test('actions per status and role: viewers only look; reopen not for drafts', () => {
  const draft = S.actionsFor('draft', 'member');
  assert.deepEqual([draft.editAnswers, draft.submit, draft.share, draft.approve, draft.reopen], [true, true, true, false, false]);
  const sub = S.actionsFor('submitted', 'owner');
  assert.deepEqual([sub.editAnswers, sub.approve, sub.reject, sub.reopen, sub.share], [false, true, true, true, false]);
  assert.equal(S.actionsFor('approved', 'owner').approve, false);
  assert.equal(S.actionsFor('rejected', 'member').reopen, true);
  for (const k of Object.values(S.actionsFor('submitted', 'viewer'))) assert.equal(k, false);
});

test('generate is blocked with a reason: viewer, no form, no template, needs approval', () => {
  const ok = { templateId: 'T1', settings: {} };
  assert.equal(S.generateBlock({ status: 'draft' }, ok, 'member'), '');
  assert.match(S.generateBlock({ status: 'draft' }, ok, 'viewer'), /only look/);
  assert.match(S.generateBlock({ status: 'draft' }, null, 'member'), /could not be loaded/);
  assert.match(S.generateBlock({ status: 'draft' }, { settings: {} }, 'member'), /no document template/);
  const strict = { templateId: 'T1', settings: { requireApprovedToExport: true } };
  assert.match(S.generateBlock({ status: 'submitted' }, strict, 'owner'), /approved/);
  assert.equal(S.generateBlock({ status: 'approved' }, strict, 'owner'), '');
});

test('mapSubmitErrors keeps the per-field list from a 422 and falls back to a message', () => {
  const r = S.mapSubmitErrors({ httpStatus: 422, message: 'Please check the highlighted answers.', data: { errors: [{ key: 'pep', message: 'This is required.' }, { key: 'owners', row: 1, field: 'name', message: 'This is required.' }] } });
  assert.equal(r.errors.length, 2);
  assert.match(r.message, /2 answers need attention: This is required/);
  assert.equal(S.mapSubmitErrors({ data: { errors: [{ key: 'a', message: 'x' }] } }).message, '1 answer needs attention: x');
  assert.deepEqual(S.mapSubmitErrors({ message: 'Reopen this submission to edit it.' }), { errors: [], message: 'Reopen this submission to edit it.' });
  assert.equal(S.mapSubmitErrors(null).errors.length, 0);
});

test('attachments: the API gets ids for existing files and key+name for new uploads, never paths', () => {
  const list = [{ id: 'A1', name: 'a.pdf', fieldKey: 'id_copy', url: 'https://s3/x' }, { key: 'tmp/A/X.pdf', name: 'b.pdf', fieldKey: 'id_copy' }];
  assert.deepEqual(S.toSaveAttachments(list), [{ id: 'A1', fieldKey: 'id_copy' }, { key: 'tmp/A/X.pdf', name: 'b.pdf', fieldKey: 'id_copy' }]);
  const shown = S.toRendererAttachments([{ id: 'A1', path: 'secret/p', name: 'a.pdf', size: 10, type: 'application/pdf', fieldKey: 'f', url: 'https://u' }]);
  assert.deepEqual(shown, [{ id: 'A1', name: 'a.pdf', size: 10, type: 'application/pdf', fieldKey: 'f', url: 'https://u' }]);
});

test('reconcile: adopt the server ids, keep files added during the save, keep files removed during the save removed', () => {
  const sent = [{ id: 'A1', fieldKey: 'f' }, { key: 'tmp/1', name: 'one.pdf', fieldKey: 'f' }];
  const server = [{ id: 'A1', name: 'a.pdf', fieldKey: 'f' }, { id: 'A2', name: 'one.pdf', fieldKey: 'f' }];
  // nothing changed locally while saving
  let local = [{ id: 'A1', name: 'a.pdf', fieldKey: 'f' }, { key: 'tmp/1', name: 'one.pdf', fieldKey: 'f' }];
  assert.deepEqual(S.reconcileAttachments(sent, local, server).map((a) => a.id), ['A1', 'A2']);
  // a new upload arrived while the request ran: it stays as a pending item
  local = [...local, { key: 'tmp/2', name: 'two.pdf', fieldKey: 'f' }];
  const r = S.reconcileAttachments(sent, local, server);
  assert.deepEqual(r.map((a) => a.id ?? a.key), ['A1', 'A2', 'tmp/2']);
  // the user removed A1 while it ran
  local = [{ key: 'tmp/1', name: 'one.pdf', fieldKey: 'f' }];
  assert.deepEqual(S.reconcileAttachments(sent, local, server).map((a) => a.id), ['A2']);
});

test('linkState: none / active / expired / used', () => {
  const now = Date.parse('2026-11-16T00:00:00Z');
  assert.equal(S.linkState({ active: false }, now).kind, 'none');
  assert.equal(S.linkState(undefined, now).kind, 'none');
  const act = S.linkState({ active: true, expiresAt: '2026-11-30T00:00:00Z', email: 'c@x.test' }, now);
  assert.equal(act.kind, 'active');
  assert.match(act.text, /sent to c@x.test/);
  assert.equal(S.linkState({ active: false, expiresAt: '2026-11-01T00:00:00Z' }, now).kind, 'expired');
  assert.equal(S.linkState({ active: false, locked: true, expiresAt: '2026-11-30T00:00:00Z' }, now).kind, 'used');
});

test('list helpers: search by title or form, fallback title, file size', () => {
  const s = { title: 'Acme CDD', formName: 'CDD: Company' };
  assert.ok(S.matchesSearch(s, 'acme'));
  assert.ok(S.matchesSearch(s, 'company'));
  assert.ok(!S.matchesSearch(s, 'zzz'));
  assert.ok(S.matchesSearch(s, '  '));
  assert.equal(S.submissionTitle({ formName: 'CDD' }), 'CDD');
  assert.equal(S.submissionTitle({}), 'Untitled');
  assert.equal(S.actorName({ name: 'Customer (link)' }), 'Customer (link)');
  assert.deepEqual([S.fileSize(900), S.fileSize(2048), S.fileSize(5 * 1024 * 1024)], ['900 B', '2 KB', '5.0 MB']);
});
