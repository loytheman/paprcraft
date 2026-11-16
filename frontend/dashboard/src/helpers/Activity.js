// Turns audit trail rows (GET /activity/account; written by
// backend/lambda/auditRow.js) into words: who did what to which record, and what changed.
import { formatDate, formatDateTime } from '@/helpers/Format';

const NOUN = {
  // Add one entry per record type of your own, e.g. Order: () => 'order',
  Label: () => 'label',
  Template: () => 'template',
  Account: () => 'account',
  AccountMember: () => 'team member',
};
export const nounOf = (r) => NOUN[r.recordType]?.(r) ?? 'record';

const VERB = {
  created: 'created',
  updated: 'changed',
  deleted: 'deleted',
  plan_changed: 'changed the plan',
};

// actor.staff: Paprcraft staff. Customers see "Paprcraft support" (the API hides who); staff see
// the person, marked as staff.
// A sign-in is filed on the account that signed in, so its email (recordLabel) names the person
// when the stamp has no name (sign-ins recorded before 9 Nov 2026 carried none).
export const actorName = (r) =>
  r.actor?.userId
    ? r.actor.name || r.actor.email || (r.action === 'signed_in' && r.recordLabel) || 'Someone'
    : r.actor?.staff ? 'Paprcraft support' : 'System';
export const isSystem = (r) => !r.actor?.userId && !r.actor?.staff;
export const isStaffActor = (r) => !!r.actor?.staff;

const METHOD = { password: 'password', google: 'Google', invite: 'an invitation link' };

// { verb, noun, label }: the sentence parts, so the view can style the record name.
export const describe = (r) => {
  if (r.action === 'signed_in') {
    const m = r.actor?.signInMethod;
    return { verb: m ? `signed in with ${METHOD[m] ?? m}` : 'signed in', noun: '', label: '' };
  }
  if (r.action === 'plan_changed') {
    const c = r.changes?.find((x) => x.field === 'plan');
    return { verb: c ? `changed the plan from ${planName(c.from)} to ${planName(c.to)}` : 'changed the plan', noun: '', label: '' };
  }
  if (r.recordType === 'AccountMember') {
    const label = r.recordLabel ?? '';
    if (r.action === 'created') return { verb: 'invited', noun: 'a team member', label };
    if (r.action === 'deleted') return { verb: 'removed', noun: 'the team member', label };
    // Accepting an invite flips the status to active, done by the person joining.
    if (r.changes?.some((c) => c.field === 'status' && c.to === 'active')) return { verb: 'joined the team', noun: '', label: '' };
  }
  return { verb: VERB[r.action] ?? r.action, noun: `the ${nounOf(r)}`, label: r.recordLabel ?? '' };
};

const planName = (p) => ({ free: 'Free', pro: 'Pro' })[p] ?? p ?? 'none';

// Plain-language field names. Anything not listed shows its raw name.
export const FIELD_LABEL = {
  name: 'Name', section: 'Sections', placeholders: 'Placeholders', exportHistory: 'Exports', status: 'Status', labelIds: 'Labels', notes: 'Notes', color: 'Colour', plan: 'Plan', billingStatus: 'Billing status',
  cancelAt: 'Cancels on', billingExempt: 'Billing exempt', firstName: 'First name', lastName: 'Last name', fullName: 'Name', email: 'Email',
  mobile: 'Mobile', mobileFull: 'Mobile', role: 'Role', accountStatus: 'Account status', signedInAt: 'Last sign-in',
  invitedEmail: 'Invited email', invitedAt: 'Invited', joinedAt: 'Joined',
  id: 'ID', accountId: 'Account', limitOverrides: 'Custom limits', compPlan: 'Complimentary plan',
  internalNotes: 'Staff notes', lastStaffAction: 'Staff action', billingAdminNote: 'Staff billing note',
};
export const fieldLabel = (f) => FIELD_LABEL[f] ?? f;

// Fields that only make sense as part of a list of settings, not as changes (create/delete).
const HIDE_ON_SNAPSHOT = new Set(['id', 'accountId']);
export const visibleChanges = (r) => (r.changes ?? []).filter((c) => !(r.action === 'created' || r.action === 'deleted') || !HIDE_ON_SNAPSHOT.has(c.field));

// lookups: { labels } as { id: name } maps; ids that are gone show as "deleted".
export const formatValue = (field, v, lookups = {}) => {
  if (v == null || v === '') return '(none)';
  const names = (map, kind) => (Array.isArray(v) ? (v.length ? v.map((id) => map?.[id] ?? `deleted ${kind}`).join(', ') : '(none)') : String(v));
  switch (field) {
    case 'labelIds': return names(lookups.labels, 'label');
    case 'cancelAt': return formatDate(v);
    case 'signedInAt': return formatDateTime(v);
    case 'plan': case 'compPlan': return planName(v);
    case 'role': return ({ member: 'Member', viewer: 'Viewer', owner: 'Owner' })[v] ?? String(v);
    case 'invitedEmail': return String(v);
    case 'limitOverrides': return limitsText(v);
    case 'lastStaffAction': case 'billingAdminNote': return v && typeof v === 'object' ? `${v.action}${v.reason ? `: ${v.reason}` : ''}` : String(v);
    default:
      if (typeof v === 'boolean') return v ? 'Yes' : 'No';
      if (Array.isArray(v)) return v.join(', ') || '(none)';
      if (typeof v === 'object') return JSON.stringify(v);
      return String(v);
  }
};

export const LIMIT_LABEL = {
  labelLimit: 'Labels', templateLimit: 'Templates', teamLimit: 'Team (people)',
};
const limitsText = (o) =>
  o && typeof o === 'object' && Object.keys(o).length
    ? Object.entries(o).map(([f, x]) => `${LIMIT_LABEL[f] ?? f} ${x?.value}${x?.until ? ` until ${formatDate(x.until)}` : ''}`).join(', ')
    : 'Plan defaults';

// "Chrome on macOS · Singapore, SG · 203.0.113.7"
export const whereText = (actor) => {
  if (!actor?.userId) return '';
  const d = actor.device;
  const device = d && (d.browser || d.os) ? [d.browser, d.os].filter(Boolean).join(' on ') : null;
  const l = actor.location;
  const place = l && (l.city || l.country) ? [l.city, l.country].filter(Boolean).join(', ') : null;
  return [device, place, actor.ip].filter(Boolean).join(' · ');
};

// Rows grouped under "Today", "Yesterday", "Mon 3 Nov 2026".
export const groupByDay = (rows, now = new Date()) => {
  const key = (d) => d.toDateString();
  const today = key(now);
  const yesterday = key(new Date(now.getTime() - 86400000));
  const groups = [];
  for (const r of rows) {
    const d = new Date(r.createdAt);
    const k = key(d);
    let g = groups[groups.length - 1];
    if (!g || g.key !== k) {
      const title = k === today ? 'Today' : k === yesterday ? 'Yesterday' : d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
      g = { key: k, title, rows: [] };
      groups.push(g);
    }
    g.rows.push(r);
  }
  return groups;
};

// CSV columns for the Activity export.
export const csvColumns = (lookups) => [
  { label: 'Time (UTC)', value: (r) => r.createdAt },
  { label: 'Who', value: (r) => actorName(r) },
  { label: 'Email', value: (r) => r.actor?.email ?? '' },
  { label: 'Action', value: (r) => r.action },
  { label: 'Type', value: (r) => nounOf(r) },
  { label: 'Record', value: (r) => r.recordLabel ?? '' },
  { label: 'Changes', value: (r) => (r.action === 'updated' || r.action === 'plan_changed'
    ? (r.changes ?? []).map((c) => `${fieldLabel(c.field)}: ${formatValue(c.field, c.from, lookups)} -> ${formatValue(c.field, c.to, lookups)}`).join('; ')
    : '') },
  { label: 'IP address', value: (r) => r.actor?.ip ?? '' },
  { label: 'Device', value: (r) => (r.actor?.device ? [r.actor.device.browser, r.actor.device.os].filter(Boolean).join(' on ') : '') },
  { label: 'Location', value: (r) => (r.actor?.location ? [r.actor.location.city, r.actor.location.region, r.actor.location.country].filter(Boolean).join(', ') : '') },
];
