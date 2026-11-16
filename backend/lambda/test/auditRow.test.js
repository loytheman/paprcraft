// Audit trail rules (auditRow.js): what's audited, who gets the credit, and what's never stored.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { toAuditRow, AUDITED_TYPES } = require('../auditRow.js');

const NOW = Date.parse('2026-11-09T10:00:00Z');
const person = {
  userId: 'U1', name: 'Alice', email: 'alice@x.com', ip: '1.2.3.4',
  clientInfo: { deviceType: 'desktop', os: 'macOS', browser: 'Chrome' },
  locationData: { city: 'Singapore', region: '01', country: 'SG', latitude: 1.29, longitude: 103.85 },
};
const label = (over = {}) => ({
  pk: '#LABEL:L1', sk: '#LABEL#METADATA', gs0pk: '#ACCOUNT:A1', _type: 'Label',
  id: 'L1', accountId: 'A1', name: 'prod', color: 'blue',
  updatedAt: '2026-11-09T09:59:00Z', auditStreamId: 'S1', updatedBy: person, ...over,
});
const ev = (eventName, oldImg, newImg) => ({ eventName, eventID: 'E1', oldImg, newImg, approximateCreationDateTime: NOW / 1000 });

test('a person changing a record: credited, with the changed fields, city/country only', () => {
  const row = toAuditRow(ev('MODIFY', label(), label({ color: 'pink', auditStreamId: 'S2' })), NOW);
  assert.equal(row.action, 'updated');
  assert.deepEqual(row.changes, [{ field: 'color', from: 'blue', to: 'pink' }]);
  assert.equal(row.actor.userId, 'U1');
  assert.deepEqual(row.actor.location, { city: 'Singapore', region: '01', country: 'SG' }); // no coordinates
  assert.equal(row.gs0pk, '#AUDIT#ACCOUNT:A1');
  assert.equal(row.gs1pk, '#AUDIT#USER:U1');
  assert.equal(row.gs2pk, '#AUDIT#REF:#LABEL:L1');
  assert.equal(row.gs3pk, '#AUDIT#ALL');
  assert.equal(row.recordLabel, 'prod');
});

test('a system write (no new auditStreamId) is credited to System, not the last person', () => {
  const row = toAuditRow(ev('MODIFY', label(), label({ color: 'pink' })), NOW); // same S1
  assert.equal(row.actor.name, 'System');
  assert.equal(row.userId, null);
  assert.equal(row.gs1pk, undefined);
  assert.equal(row.gs0pk, '#AUDIT#ACCOUNT:A1'); // still in the customer's trail
});

test('secrets are never recorded', () => {
  const acct = toAuditRow(ev('INSERT', null, { _type: 'Account', pk: '#ACCOUNT:A9', id: 'A9', email: 'z@x.com', passwordHash: 'H', auditStreamId: 'S3', createdBy: person }), NOW);
  assert.equal(acct.changes.some((c) => c.field === 'passwordHash'), false);
  assert.equal(acct.gs0pk, '#AUDIT#ACCOUNT:A9');
});

test('sign-in is recorded as "signed in" with no field changes', () => {
  const acct = { _type: 'Account', pk: '#ACCOUNT:U1', id: 'U1', email: 'alice@x.com', signedInAt: '2026-11-08T00:00:00Z', auditStreamId: 'S1', updatedBy: person };
  const row = toAuditRow(ev('MODIFY', acct, { ...acct, signedInAt: '2026-11-09T10:00:00Z', signInAttempt: 0, auditStreamId: 'S9', updatedBy: { ...person, signInMethod: 'google' } }), NOW);
  assert.equal(row.action, 'signed_in');
  assert.deepEqual(row.changes, []);
  assert.equal(row.actor.signInMethod, 'google');
  assert.equal(row.recordLabel, 'alice@x.com');
});

test('plan change is recorded as plan_changed', () => {
  const acct = { _type: 'Account', pk: '#ACCOUNT:U1', id: 'U1', email: 'alice@x.com', plan: 'free', auditStreamId: 'S1', updatedBy: person };
  const row = toAuditRow(ev('MODIFY', acct, { ...acct, plan: 'pro', auditStreamId: 'S2' }), NOW);
  assert.equal(row.action, 'plan_changed');
  assert.deepEqual(row.changes, [{ field: 'plan', from: 'free', to: 'pro' }]);
  assert.equal(row.actor.userId, 'U1');
});

test('delete: credited to the deleter only if the stamp was just applied', () => {
  const fresh = toAuditRow(ev('REMOVE', label({ updatedAt: '2026-11-09T09:59:30Z' }), null), NOW);
  assert.equal(fresh.action, 'deleted');
  assert.equal(fresh.actor.userId, 'U1');
  const stale = toAuditRow(ev('REMOVE', label({ updatedAt: '2026-11-01T00:00:00Z' }), null), NOW);
  assert.equal(stale.actor.name, 'System');
});

test('unaudited record types are ignored', () => {
  assert.deepEqual(AUDITED_TYPES, ['Account', 'Label', 'Form', 'Submission', 'Template', 'AccountMember']);
  assert.equal(toAuditRow(ev('INSERT', null, { _type: 'Token', pk: '#TOKEN:1' }), NOW), null);
});

test('rows use the record\'s millisecond time when it is this change, so same-second changes keep their order', () => {
  const row = toAuditRow(ev('MODIFY', label(), label({ name: 'x', updatedAt: '2026-11-09T10:00:00.427Z', auditStreamId: 'S2' })), NOW);
  assert.equal(row.createdAt, '2026-11-09T10:00:00.427Z');
  const stale = toAuditRow(ev('MODIFY', label(), label({ name: 'x', updatedAt: '2026-11-01T00:00:00.000Z' })), NOW);
  assert.equal(stale.createdAt, '2026-11-09T10:00:00.000Z');
});

test('form answers are audited field by field, and the link token hash and schema snapshot never are', () => {
  const sub = (over = {}) => ({ pk: '#SUBMISSION:S1', _type: 'Submission', id: 'S1', accountId: 'A1', formName: 'CDD', title: 'Acme', status: 'draft',
    values: { full_name: 'Ann Lee', kind: 'ind' }, schema: { sections: [{ id: 's1', title: 'X', fields: [] }] }, auditStreamId: 'S1', updatedBy: person, ...over });
  const row = toAuditRow(ev('MODIFY', sub(), sub({ values: { full_name: 'Anne Lee', kind: 'ind', age: 34 }, schema: { sections: [] }, tokenHash: 'abc', auditStreamId: 'S2' })), NOW);
  assert.deepEqual(row.changes, [
    { field: 'values.full_name', from: 'Ann Lee', to: 'Anne Lee' },
    { field: 'values.age', from: null, to: 34 },
  ].sort((a, b) => row.changes.findIndex((c) => c.field === a.field) - row.changes.findIndex((c) => c.field === b.field)));
  assert.ok(!row.changes.some((c) => c.field === 'tokenHash' || c.field.startsWith('schema')));
  assert.equal(row.recordLabel, 'Acme');
});

test('submission status changes read as submitted / approved / rejected / reopened, with who decided', () => {
  const sub = (over = {}) => ({ pk: '#SUBMISSION:S1', _type: 'Submission', id: 'S1', accountId: 'A1', formName: 'CDD', status: 'submitted', auditStreamId: 'S1', updatedBy: person, ...over });
  assert.equal(toAuditRow(ev('MODIFY', sub(), sub({ status: 'approved', decidedBy: person, decisionComment: 'ok', auditStreamId: 'S2' })), NOW).action, 'approved');
  assert.equal(toAuditRow(ev('MODIFY', sub(), sub({ status: 'rejected', auditStreamId: 'S2' })), NOW).action, 'rejected');
  assert.equal(toAuditRow(ev('MODIFY', sub({ status: 'approved' }), sub({ status: 'draft', auditStreamId: 'S2' })), NOW).action, 'reopened');
  assert.equal(toAuditRow(ev('MODIFY', sub({ status: 'draft' }), sub({ status: 'submitted', auditStreamId: 'S2' })), NOW).action, 'submitted');
});

test('a customer saving through a link is credited as "Customer (link)" with their IP', () => {
  const customer = { userId: null, name: 'Customer (link)', ip: '9.9.9.9' };
  const sub = (over = {}) => ({ pk: '#SUBMISSION:S1', _type: 'Submission', id: 'S1', accountId: 'A1', formName: 'CDD', status: 'draft', values: {}, auditStreamId: 'S1', updatedBy: person, ...over });
  const row = toAuditRow(ev('MODIFY', sub(), sub({ values: { full_name: 'Ann' }, auditStreamId: 'S2', updatedBy: customer })), NOW);
  assert.equal(row.actor.name, 'Customer (link)');
  assert.equal(row.actor.ip, '9.9.9.9');
  assert.equal(row.userId, null);
  assert.equal(row.gs1pk, undefined);
});

test('a form definition is audited per section and field, and publishing reads as published', () => {
  const form = (over = {}) => ({ pk: '#FORM:F1', _type: 'Form', id: 'F1', accountId: 'A1', name: 'CDD', status: 'draft', version: 0, auditStreamId: 'S1', updatedBy: person,
    schema: { sections: [{ id: 's1', title: 'Customer', fields: [{ id: 'f1', key: 'full_name', type: 'text', label: 'Full name' }] }] }, ...over });
  const edited = form({ auditStreamId: 'S2', schema: { sections: [{ id: 's1', title: 'Customer', fields: [{ id: 'f1', key: 'full_name', type: 'text', label: 'Name', required: true }, { id: 'f2', key: 'age', type: 'number', label: 'Age' }] }] } });
  const row = toAuditRow(ev('MODIFY', form(), edited), NOW);
  assert.deepEqual(row.changes.map((c) => c.field).sort(), ['schema.field.age', 'schema.field.full_name']);
  const pub = toAuditRow(ev('MODIFY', form(), form({ status: 'published', version: 1, auditStreamId: 'S2' })), NOW);
  assert.equal(pub.action, 'published');
  const master = toAuditRow(ev('INSERT', null, form({ accountId: 'MASTER' })), NOW);
  assert.equal(master.gs0pk, undefined); // masters have no customer trail
});
