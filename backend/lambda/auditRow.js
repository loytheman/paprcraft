// Pure part of the audit trail writer (auditTrail.js): which changes are audited, who gets the
// credit, what's recorded. No AWS dependencies, so it's unit-tested directly
// (test/auditRow.test.js). Keys must match backend/api/src/models/model.activity.trail.js.
//
// OneTable model name (_type) -> how to label the record, and which account it belongs to (every
// row is filed under one account, so a customer sees their whole history in one place).
const AUDITED = {
  Account: { label: (r) => r.email, accountId: (r) => r.id },
  Label: { label: (r) => r.name, accountId: (r) => r.accountId },
  Template: { label: (r) => r.name, accountId: (r) => (r.accountId === 'MASTER' ? null : r.accountId) }, // masters (staff-managed) have no customer trail
  AccountMember: { label: (r) => r.invitedEmail, accountId: (r) => r.accountId }, // team (service.team.js)
};
const AUDITED_TYPES = Object.keys(AUDITED);

// Never stored in the trail.
const SECRET_FIELDS = new Set([
  'passwordHash', 'verificationToken', // account
  'secretHash', // api key
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

// [{ field, from, to }] for every meaningful field that differs.
function diff(oldImg = {}, newImg = {}) {
  const changes = [];
  for (const k of new Set([...Object.keys(oldImg), ...Object.keys(newImg)])) {
    if (skip(k)) continue;
    if (JSON.stringify(oldImg[k] ?? null) === JSON.stringify(newImg[k] ?? null)) continue;
    changes.push({ field: k, from: clean(oldImg[k]), to: clean(newImg[k]) });
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
    changes = diff({}, newImg);
    human = !!newImg.auditStreamId;
    stamp = newImg.createdBy || newImg.updatedBy;
  } else if (eventName === 'REMOVE') {
    action = 'deleted';
    changes = diff(oldImg, {});
    // Deletes are stamped (updatedBy + new auditStreamId) just before removal, so the old image's
    // stamp is the deleter's, but only if it's that fresh, not left over from an earlier edit.
    human = !!oldImg.auditStreamId && now - Date.parse(oldImg.updatedAt || 0) < 5 * 60 * 1000;
    stamp = oldImg.updatedBy;
  } else {
    changes = diff(oldImg, newImg);
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
