// Pure part of the audit trail writer (auditTrail.js): which changes are audited, who gets the
// credit, what's recorded. No AWS dependencies, so it's unit-tested directly
// (test/auditRow.test.js). Keys must match backend/api/src/models/model.activity.trail.js.
//
// OneTable model name (_type) -> how to label the record, and which account it belongs to (every
// row is filed under one account, so a customer sees their whole history in one place).
const AUDITED = {
  Account: { label: (r) => r.email, accountId: (r) => r.id },
  Label: { label: (r) => r.name, accountId: (r) => r.accountId },
  Form: { label: (r) => r.name, accountId: (r) => (r.accountId === 'MASTER' ? null : r.accountId) },
  Submission: { label: (r) => r.title || r.formName, accountId: (r) => r.accountId },
  Template: { label: (r) => r.name, accountId: (r) => (r.accountId === 'MASTER' ? null : r.accountId) }, // masters (staff-managed) have no customer trail
  AccountMember: { label: (r) => r.invitedEmail, accountId: (r) => r.accountId }, // team (service.team.js)
  ValueSet: { label: (r) => r.name, accountId: (r) => r.accountId }, // placeholder values (service.valueSet.js)
};
const AUDITED_TYPES = Object.keys(AUDITED);

// Never stored in the trail.
const SECRET_FIELDS = new Set([
  'passwordHash', 'verificationToken', // account
  'secretHash', // api key
  'tokenHash', // a customer form link
]);
// Not "what changed" from a person's point of view: keys, stamps, counters, and the fields the
// background jobs write all day long. A change made only of these isn't recorded.
const IGNORED_FIELDS = new Set([
  'pk', 'sk', '_type', 'createdAt', 'updatedAt', 'createdBy', 'updatedBy', 'auditStreamId', 'sub',
  // Account
  'keywordSearch', 'exportHistory', 'signInAttempt', 'stripeCustomerId', 'stripeSubscriptionId', 'currentPeriodEnd', 'hasPaymentMethod', 'planNotified',
  // Add bookkeeping fields your own record types write in the background (counters, last-run stamps).
]);
const isIndexField = (k) => /^gs\d+(pk|sk)$/.test(k);
const skip = (k) => SECRET_FIELDS.has(k) || IGNORED_FIELDS.has(k) || isIndexField(k);

const MAX_VALUE_LENGTH = 500;
const clean = (v) => {
  if (v === undefined) return null;
  const s = typeof v === 'string' ? v : JSON.stringify(v);
  return s.length > MAX_VALUE_LENGTH ? `${s.slice(0, MAX_VALUE_LENGTH)}…` : v;
};

// A submission's answers and a form's definition are audited field by field, so a change shows as
// "values.full_name: Ann -> Anne" or "schema.field.risk: {...}" rather than one big blob. (A
// submission's own copy of the schema is a snapshot, never audited.)
function flattenSchema(schema) {
  const out = {};
  for (const sec of schema?.sections ?? []) {
    out[`schema.section.${sec.id}`] = { title: sec.title, description: sec.description ?? null, visibleIf: sec.visibleIf ?? null };
    for (const f of sec.fields ?? []) {
      const { id, ...def } = f; // eslint-disable-line no-unused-vars
      out[`schema.field.${f.key}`] = { section: sec.id, ...def };
    }
  }
  return out;
}

function flat(img = {}, type) {
  const out = {};
  for (const [k, v] of Object.entries(img)) {
    if (k === 'values' && v && typeof v === 'object') {
      for (const [vk, vv] of Object.entries(v)) out[`values.${vk}`] = vv;
    } else if (k === 'schema') {
      if (type === 'Form') Object.assign(out, flattenSchema(v));
    } else out[k] = v;
  }
  return out;
}

// [{ field, from, to }] for every meaningful field that differs.
function diff(oldImg = {}, newImg = {}, type) {
  const changes = [];
  const o = flat(oldImg, type);
  const n = flat(newImg, type);
  for (const k of new Set([...Object.keys(o), ...Object.keys(n)])) {
    if (skip(k)) continue;
    if (JSON.stringify(o[k] ?? null) === JSON.stringify(n[k] ?? null)) continue;
    changes.push({ field: k, from: clean(o[k]), to: clean(n[k]) });
  }
  return changes;
}

// Only what's useful for security/audit: no coordinates, even if a stamp carried them.
function actorFrom(stamp) {
  if (!stamp) return null;
  const { userId = null, name = null, email = null, ip = null, clientInfo = null, locationData = null, signInMethod, staff } = stamp;
  return {
    userId,
    name,
    email,
    ip,
    device: clientInfo ? { type: clientInfo.deviceType ?? null, os: clientInfo.os ?? null, browser: clientInfo.browser ?? null } : null,
    location: locationData ? { city: locationData.city ?? null, region: locationData.region ?? null, country: locationData.country ?? null } : null,
    ...(signInMethod && { signInMethod }),
    ...(staff && { staff: true }), // Paprcraft staff acting on a customer's account
  };
}

const SYSTEM = { userId: null, name: 'System', email: null, ip: null, device: null, location: null };

// A friendlier verb than "updated" when the change is one thing people look for.
function updateAction(type, changes) {
  const fields = changes.map((c) => c.field);
  // eslint-disable-next-line no-unused-vars
  const only = (f) => fields.length === 1 && fields[0] === f;
  if (type === 'Account' && fields.every((f) => f === 'signedInAt')) return 'signed_in';
  // Add friendlier verbs for your own record types here, e.g.
  // if (type === 'Order' && only('status') && changes[0].to === 'shipped') return 'shipped';
  if (type === 'Account' && fields.includes('plan')) return 'plan_changed';
  if (type === 'Submission' && fields.includes('status')) return { submitted: 'submitted', approved: 'approved', rejected: 'rejected', draft: 'reopened' }[changes.find((c) => c.field === 'status').to] || 'updated';
  if (type === 'Form' && fields.includes('status')) return changes.find((c) => c.field === 'status').to === 'published' ? 'published' : 'unpublished';
  return 'updated';
}

// The stream's time is whole seconds, so several changes in one second would sort in random
// order. The record's own updatedAt (milliseconds) is the same moment when it was written by this
// change, so use it when it falls within that second (a delete's fresh stamp too).
function whenOf(img, approximateCreationDateTime, now) {
  const approxMs = (approximateCreationDateTime || now / 1000) * 1000;
  const own = Date.parse(img.updatedAt || img.createdAt || '');
  return new Date(Number.isFinite(own) && Math.abs(own - approxMs) < 2000 ? own : approxMs).toISOString();
}

// Turns one stream record (images already unmarshalled to plain objects) into an audit row, or
// null if it isn't worth one. now: for the "fresh delete stamp" check (tests pass their own).
function toAuditRow({ eventName, eventID, oldImg, newImg, approximateCreationDateTime }, now = Date.now()) {
  const img = newImg || oldImg;
  const type = img?._type;
  const rules = AUDITED[type];
  if (!rules) return null;

  let action;
  let changes;
  let human;
  let stamp;
  if (eventName === 'INSERT') {
    action = 'created';
    changes = diff({}, newImg, type);
    human = !!newImg.auditStreamId;
    stamp = newImg.createdBy || newImg.updatedBy;
  } else if (eventName === 'REMOVE') {
    action = 'deleted';
    changes = diff(oldImg, {}, type);
    // Deletes are stamped (updatedBy + new auditStreamId) just before removal, so the old image's
    // stamp is the deleter's, but only if it's that fresh, not left over from an earlier edit.
    human = !!oldImg.auditStreamId && now - Date.parse(oldImg.updatedAt || 0) < 5 * 60 * 1000;
    stamp = oldImg.updatedBy;
  } else {
    changes = diff(oldImg, newImg, type);
    if (!changes.length) return null; // only housekeeping fields changed
    action = updateAction(type, changes);
    if (action === 'signed_in') changes = [];
    human = !!newImg.auditStreamId && newImg.auditStreamId !== oldImg.auditStreamId;
    stamp = newImg.updatedBy;
  }

  const actor = human ? actorFrom(stamp) || SYSTEM : SYSTEM;
  const createdAt = whenOf(img, approximateCreationDateTime, now);
  const id = eventID;
  const sortKey = `${createdAt}#${id}`;
  const refId = img.pk; // e.g. "#MONITOR:01J...": a record's history across all its changes
  const accountId = rules.accountId(img) || null;
  return {
    pk: `#AUDIT:${id}`,
    sk: '#AUDIT#METADATA',
    gs0pk: accountId ? `#AUDIT#ACCOUNT:${accountId}` : undefined, // an account's activity
    gs0sk: accountId ? sortKey : undefined,
    gs1pk: actor.userId ? `#AUDIT#USER:${actor.userId}` : undefined, // everything one person did
    gs1sk: actor.userId ? sortKey : undefined,
    gs2pk: `#AUDIT#REF:${refId}`, // one record's history
    gs2sk: sortKey,
    gs3pk: '#AUDIT#ALL', // staff: everything, newest first
    gs3sk: sortKey,
    _type: 'AuditTrail',
    id,
    createdAt,
    action,
    eventName,
    recordType: type,
    recordKind: rules.kind ? rules.kind(img) : null, // optional sub-kind of a record type
    recordId: img.id ?? null,
    recordLabel: clean(rules.label(img) ?? null),
    refId,
    accountId,
    userId: actor.userId,
    actor,
    changes,
    auditStreamId: human ? img.auditStreamId : null,
  };
}

module.exports = { toAuditRow, AUDITED_TYPES };
