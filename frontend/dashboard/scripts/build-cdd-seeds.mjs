// One-off: builds the "CDD: Individual" and "CDD: Company" master forms and their output templates
// (backend/api/src/scripts/masters/forms/*.json, imported by seed-master-templates.js). The
// questions and service lists come from the corpsec repo (infra/word-to-pdf/docx assets/json/case.js);
// the layout follows its customer due diligence form. Cell html is generated with the editor's own
// Quill setup so the editor and the docx renderer agree.
//
//   node scripts/build-cdd-seeds.mjs /path/to/assets/json/case.js
import { JSDOM } from 'jsdom';
import { writeFileSync, mkdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { nanoid } from 'nanoid';

const dom = new JSDOM('<!doctype html><body></body>', { pretendToBeVisual: true });
for (const k of ['window', 'document', 'navigator', 'Node', 'Element', 'HTMLElement', 'MutationObserver', 'getSelection', 'CustomEvent', 'Event', 'DOMParser', 'NodeFilter', 'Text', 'Range']) {
  if (dom.window[k] !== undefined) Object.defineProperty(globalThis, k, { value: dom.window[k], configurable: true, writable: true });
}
document.getSelection ??= () => dom.window.getSelection();
const Q = await import('../src/helpers/template/quill.js');
const E = await import('../../design-system/lib/forms.js');

const src = process.argv[2];
if (!src) { console.error('usage: node scripts/build-cdd-seeds.mjs /path/to/case.js'); process.exit(1); }
const C = await import(pathToFileURL(src).href);

// ---- form helpers ---------------------------------------------------------------------------------
let fid = 0;
const F = (key, type, label, extra = {}) => ({ id: `f${++fid}`, key, type, label, ...extra });
const opts = (list) => list.map((label, i) => ({ value: `o${i + 1}`, label: label.replace(/\s+/g, ' ').trim() }));
const optsOf = (pairs) => pairs.map(([value, label]) => ({ value, label }));
const section = (id, title, fields, extra = {}) => ({ id, title, fields, ...extra });
const clean = (s) => s.replace(/\s+/g, ' ').trim();

const GENDER = optsOf([['male', 'Male'], ['female', 'Female'], ['other', 'Other']]);
const ENTITY_TYPES = optsOf([['pte_ltd', 'Private company limited by shares'], ['exempt_pte', 'Exempt private company limited by shares'], ['public', 'Public company'], ['llp', 'Limited liability partnership'], ['sole_prop', 'Sole proprietorship'], ['other', 'Other']]);
const ROLES = optsOf([['director', 'Director'], ['shareholder', 'Shareholder'], ['beneficial_owner', 'Beneficial owner'], ['authorised_signatory', 'Authorised signatory'], ['other', 'Other']]);
const RATING = optsOf([['low', 'Low'], ['medium', 'Medium'], ['high', 'High']]);
const YESNO_DECISION = optsOf([['yes', 'Yes'], ['no', 'No']]);

const questions = (list) => list.filter((q) => !/^(This would include:|\([a-z]\) )/.test(q.trim())).map(clean);
const checklist = (key, label, list, extra = {}) => F(key, 'checklist', label, { required: true, internal: true, options: questions(list).map((q, i) => ({ value: `q${i + 1}`, label: q })), ...extra });

const associatedIndividuals = () => F('parties_individual', 'group', 'Associated individuals', { help: 'Directors, shareholders, beneficial owners or signatories connected to this customer.', group: { max: 50, fields: [
  F('p_name', 'text', 'Full name', { required: true }),
  F('p_id_no', 'text', 'Identification no.'),
  F('p_nationality', 'country', 'Nationality'),
  F('p_role', 'select', 'Role', { options: ROLES }),
  F('p_share_pct', 'number', 'Shareholding (%)', { min: 0, max: 100 }),
  ...C.individualCheckList.map((c) => F(`p_${c.value.replace(/Flag$/, '').replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`)}`, 'yesno', c.key)),
] } });
const associatedCompanies = () => F('parties_company', 'group', 'Associated companies', { help: 'Entities connected to this customer, for example corporate shareholders.', group: { max: 50, fields: [
  F('c_name', 'text', 'Entity name', { required: true }),
  F('c_uen', 'text', 'Unique entity no.'),
  F('c_country', 'country', 'Country of incorporation'),
  F('c_inc_date', 'date', 'Date of incorporation'),
  F('c_address', 'longtext', 'Registered address'),
  ...C.companyCheckList.map((c) => F('c_registrable_controller', 'yesno', c.key)),
  F('c_remarks', 'text', 'Remarks'),
] } });

const reviewFields = () => [
  F('risk_rating', 'select', 'Risk assessment rating', { internal: true, options: RATING }),
  F('risk_comment', 'longtext', 'Risk assessment comment', { internal: true }),
  F('recommendation', 'select', 'Acceptance of customer', { internal: true, options: YESNO_DECISION }),
  F('recommending_officer', 'text', 'Recommending officer', { internal: true }),
  F('recommendation_comment', 'longtext', 'Recommendation comment', { internal: true }),
  F('approval', 'select', 'Approval for acceptance', { internal: true, options: YESNO_DECISION }),
  F('approving_officer', 'text', 'Approving officer', { internal: true }),
  F('approval_comment', 'longtext', 'Approval comment', { internal: true }),
  F('screening_notes', 'longtext', 'Screening results and notes', { internal: true, help: 'Name screening outcome (sanctions, adverse media) for the customer and associated parties.' }),
];

const CONSENT = 'I declare that the information provided in this form is accurate and truthful. I understand that if I am found to have knowingly made false statements or intentionally omitted any significant details, I may face prosecution and legal penalties under applicable law.';
const settings = { intro: 'Please complete this form. Fields marked * are required.', consentText: CONSENT, publicEnabled: true, requireApprovedToExport: false };

const individualForm = () => {
  fid = 0;
  return { name: 'CDD: Individual', description: 'Customer due diligence form for an individual customer, with associated parties and an officer risk assessment.', settings,
    schema: { sections: [
      section('customer', 'Customer information', [
        F('full_name', 'text', 'Full name', { required: true }),
        F('gender', 'select', 'Gender', { options: GENDER }),
        F('id_no', 'text', 'Identification no.', { required: true }),
        F('id_expiry', 'date', 'Expiry date of ID'),
        F('nationality', 'country', 'Nationality'),
        F('dob', 'date', 'Date of birth'),
        F('address', 'longtext', 'Address'),
        F('email', 'email', 'Email'),
        F('contact_no', 'phone', 'Contact number'),
      ]),
      section('case', 'Case information', [
        F('services', 'multiselect', 'Nature of services provided', { options: opts(C.serviceListIndividual) }),
        F('remarks', 'longtext', 'Remarks'),
      ]),
      section('parties', 'Associated parties', [associatedCompanies(), associatedIndividuals()]),
      section('declaration', 'Declaration', [F('declaration_signature', 'signature', 'Signature', { required: true, help: 'Type your full name to sign.' })]),
      section('risk', 'Risk assessment (officer use)', [checklist('risk_customer', 'Customer risk assessment', C.riskCustomer), ...reviewFields()]),
    ] } };
};

const companyForm = () => {
  fid = 0;
  const holders = F('shareholders', 'group', 'Shareholders', { group: { max: 100, fields: [
    F('sh_type', 'select', 'Type', { options: optsOf([['individual', 'Individual'], ['company', 'Company']]) }),
    F('sh_name', 'text', 'Name', { required: true }),
    F('sh_id', 'text', 'ID / registration no.'),
    F('sh_class', 'text', 'Share class'),
    F('sh_pct', 'number', 'Shareholding (%)', { min: 0, max: 100 }),
  ] } });
  const directors = F('directors', 'group', 'Directors and officers', { group: { max: 50, fields: [
    F('d_name', 'text', 'Full name', { required: true }),
    F('d_id', 'text', 'Identification no.'),
    F('d_nationality', 'country', 'Nationality'),
    F('d_role', 'select', 'Role', { options: ROLES }),
  ] } });
  return { name: 'CDD: Company', description: 'Customer due diligence form for a company, with shareholders, directors, associated parties and an officer risk assessment.', settings,
    schema: { sections: [
      section('customer', 'Customer information', [
        F('entity_name', 'text', 'Entity name', { required: true }),
        F('former_names', 'text', 'Former names'),
        F('uen', 'text', 'Unique entity no.', { required: true }),
        F('entity_type', 'select', 'Entity type', { options: ENTITY_TYPES }),
        F('inc_country', 'country', 'Country of incorporation'),
        F('inc_date', 'date', 'Date of incorporation'),
        F('reg_address', 'longtext', 'Registered address'),
        F('primary_activity', 'longtext', 'Primary activity'),
      ]),
      section('case', 'Case information', [
        F('services', 'multiselect', 'Nature of services provided', { options: opts(C.serviceListCompany) }),
        F('remarks', 'longtext', 'Remarks'),
      ]),
      section('people', 'Shareholders and directors', [holders, directors]),
      section('parties', 'Associated parties', [associatedCompanies(), associatedIndividuals()]),
      section('declaration', 'Declaration', [F('declaration_signature', 'signature', 'Signature', { required: true, help: 'Type your full name to sign.' })]),
      section('risk', 'Risk assessment (officer use)', [
        checklist('risk_customer', 'Customer risk assessment', C.riskCustomer),
        checklist('risk_client', 'Client risk assessment', C.riskClient),
        checklist('risk_country', 'Country risk assessment', C.riskCountry),
        checklist('risk_service', 'Service risk assessment', C.riskService),
        ...reviewFields(),
      ]),
    ] } };
};

// ---- template helpers -----------------------------------------------------------------------------
const quill = () => { const el = document.createElement('div'); document.body.appendChild(el); return new Q.Quill(el, { formats: Q.EDITOR_FORMATS, modules: { toolbar: false } }); };
// "text {{key|pipe}} more" -> delta ops with chips.
const opsOf = (text, attrs) => {
  const ops = [];
  for (const part of String(text).split(/(\{\{[^}]+\}\})/)) {
    if (!part) continue;
    const m = /^\{\{([^}]+)\}\}$/.exec(part);
    ops.push(m ? { insert: { placeholder: { text: m[1].trim(), value: '' } }, ...(attrs && { attributes: attrs }) } : { insert: part, ...(attrs && { attributes: attrs }) });
  }
  return ops;
};
const cell = (text, attrs) => {
  const q = quill();
  q.setContents({ ops: [...opsOf(text, attrs), { insert: '\n' }] }, 'silent');
  return { text: Q.editorHtml(q), delta: Q.editorDelta(q) };
};
const para = (text, attrs) => ({ id: nanoid(), type: 'paragraph', item: cell(text, attrs) });
const blank = () => para('');
const rows2 = (rows) => ({ id: nanoid(), type: 'table-01', item: { data: rows.map(([a, b]) => ({ col1: cell(a, { bold: true }), col2: cell(b) })) } });
const repeat = (group, list) => ({ id: nanoid(), type: 'repeat', item: { group, list } });
const ifBlock = (cond, list) => ({ id: nanoid(), type: 'if', item: { cond, list } });
const sign = () => ({ id: nanoid(), type: 'sign-area-04', item: { data: { desc: 'CUSTOMER', name: '{{declaration_signature}}', desc2: 'Name of Officer / Shareholder / Beneficial Owner / Purchaser / Customer', desc3: null } } });
const H = (t) => para(t, { bold: true });
const title = (t) => para(t, { bold: true, size: 'lg' });
const head = (kind) => [title(`Customer Due Diligence Form (${kind})`), para('This form is for the use of: {{firm_name}}', { size: 'sm' }), blank()];
const declaration = () => [H('Declaration'), para(CONSENT, { size: 'sm' }), blank(), sign()];
const checks = (key, list) => questions(list).map((q, i) => para(`${i + 1}. ${q}   {{${key}.q${i + 1}|yesno}}`));
const partiesBlocks = () => [
  H('Associated parties: companies'),
  repeat('parties_company', [
    rows2([['Entity name', '{{parties_company.c_name}}'], ['Unique entity no.', '{{parties_company.c_uen}}'], ['Country of incorporation', '{{parties_company.c_country|country}}'], ['Date of incorporation', '{{parties_company.c_inc_date|date}}'], ['Registered address', '{{parties_company.c_address}}'], ['Registrable controller of the company?', '{{parties_company.c_registrable_controller|yesno}}'], ['Remarks', '{{parties_company.c_remarks}}']]),
    blank(),
  ]),
  H('Associated parties: individuals'),
  repeat('parties_individual', [
    rows2([['Full name', '{{parties_individual.p_name}}'], ['Identification no.', '{{parties_individual.p_id_no}}'], ['Nationality', '{{parties_individual.p_nationality|country}}'], ['Role', '{{parties_individual.p_role}}'], ['Shareholding (%)', '{{parties_individual.p_share_pct}}'], ['Acting on behalf of the customer?', '{{parties_individual.p_custom_behalf|yesno}}'], ['Controls more than 25% of the company?', '{{parties_individual.p_more_than25_percent|yesno}}'], ['Registrable controller of the company?', '{{parties_individual.p_registrable_controller|yesno}}'], ['Politically exposed person (or family / close associate)?', '{{parties_individual.p_pep|yesno}}'], ['Source of wealth or funds information required?', '{{parties_individual.p_fund_info|yesno}}']]),
    blank(),
  ]),
];
const reviewBlocks = () => [
  H('Risk assessment review'),
  rows2([['Risk assessment rating', '{{risk_rating}}'], ['Risk assessment comment', '{{risk_comment}}'], ['Acceptance of customer', '{{recommendation}}'], ['Recommending officer', '{{recommending_officer}}'], ['Recommendation comment', '{{recommendation_comment}}'], ['Approval for acceptance', '{{approval}}'], ['Approving officer', '{{approving_officer}}'], ['Approval comment', '{{approval_comment}}']]),
  blank(),
  H('Screening'),
  para('{{screening_notes}}'),
];

const individualTemplate = () => ({ name: 'CDD: Individual', placeholders: { firm_name: 'Your firm name' }, section: [
  { name: 'Customer information', list: [
    ...head('for Individual'),
    H('Customer information'),
    rows2([['Full name', '{{full_name}}'], ['Gender', '{{gender}}'], ['Identification no.', '{{id_no}}'], ['Expiry date of ID', '{{id_expiry|date}}'], ['Nationality', '{{nationality|country}}'], ['Date of birth', '{{dob|date}}'], ['Address', '{{address}}'], ['Email', '{{email}}'], ['Contact number', '{{contact_no}}']]),
    blank(), H('Case information'),
    rows2([['Nature of services provided', '{{services|list}}'], ['Remarks', '{{remarks}}']]),
    blank(), ...declaration(),
  ] },
  { name: 'Associated parties', list: partiesBlocks() },
  { name: 'Risk assessment', list: [H('Risk assessment checklist'), H('Customer risk assessment'), ...checks('risk_customer', C.riskCustomer), blank(), ...reviewBlocks()] },
] });

const companyTemplate = () => ({ name: 'CDD: Company', placeholders: { firm_name: 'Your firm name' }, section: [
  { name: 'Customer information', list: [
    ...head('for Company'),
    H('Customer information'),
    rows2([['Entity name', '{{entity_name}}'], ['Former names', '{{former_names}}'], ['Unique entity no.', '{{uen}}'], ['Entity type', '{{entity_type}}'], ['Country of incorporation', '{{inc_country|country}}'], ['Date of incorporation', '{{inc_date|date}}'], ['Registered address', '{{reg_address}}'], ['Primary activity', '{{primary_activity}}']]),
    blank(), H('Case information'),
    rows2([['Nature of services provided', '{{services|list}}'], ['Remarks', '{{remarks}}']]),
  ] },
  { name: 'Shareholders and directors', list: [
    H('Shareholders'),
    repeat('shareholders', [rows2([['Name', '{{shareholders.sh_name}}'], ['Type', '{{shareholders.sh_type}}'], ['ID / registration no.', '{{shareholders.sh_id}}'], ['Share class', '{{shareholders.sh_class}}'], ['Shareholding (%)', '{{shareholders.sh_pct}}']]), blank()]),
    H('Directors and officers'),
    repeat('directors', [rows2([['Full name', '{{directors.d_name}}'], ['Identification no.', '{{directors.d_id}}'], ['Nationality', '{{directors.d_nationality|country}}'], ['Role', '{{directors.d_role}}']]), blank()]),
    ...declaration(),
  ] },
  { name: 'Associated parties', list: partiesBlocks() },
  { name: 'Risk assessment', list: [
    H('Risk assessment checklist'),
    H('Customer risk assessment'), ...checks('risk_customer', C.riskCustomer), blank(),
    H('Client risk assessment'), ...checks('risk_client', C.riskClient), blank(),
    H('Country risk assessment'), ...checks('risk_country', C.riskCountry), blank(),
    H('Service risk assessment'), ...checks('risk_service', C.riskService), blank(),
    ...reviewBlocks(),
  ] },
] });

// ---- build + check ---------------------------------------------------------------------------------
const outDir = new URL('../../../backend/api/src/scripts/masters/forms/', import.meta.url);
mkdirSync(outDir, { recursive: true });
for (const [file, form, template] of [['cdd-individual.json', individualForm(), individualTemplate()], ['cdd-company.json', companyForm(), companyTemplate()]]) {
  const problems = E.validateSchema(form.schema);
  if (problems.length) { console.error(`${form.name}: ${problems.join(' | ')}`); process.exit(1); }
  // every chip in the template must point at a real field (or a template placeholder)
  const keys = new Set(E.allFields(form.schema).map((f) => f.key));
  const groupFields = Object.fromEntries(E.allFields(form.schema).filter((f) => f.type === 'group').map((f) => [f.key, new Set(f.group.fields.map((g) => g.key))]));
  const bad = [];
  for (const m of JSON.stringify(template).matchAll(/"text":"([^"|]+)(?:\|[a-z]+)?","value":""/g)) {
    const [base, sub] = m[1].split('.');
    const ok = base === 'firm_name' || (sub === undefined ? keys.has(base) : (groupFields[base]?.has(sub) || (sub !== '#' && keys.has(base))));
    if (!ok) bad.push(m[1]);
  }
  for (const m of JSON.stringify(template).matchAll(/\{\{([^}|]+)(?:\|[a-z]+)?\}\}/g)) { const [base] = m[1].split('.'); if (base !== 'firm_name' && !keys.has(base)) bad.push(m[1]); }
  if (bad.length) { console.error(`${form.name}: template points at unknown fields: ${[...new Set(bad)].join(', ')}`); process.exit(1); }
  writeFileSync(new URL(file, outDir), JSON.stringify({ form, template }, null, 2) + '\n');
  const n = E.allFields(form.schema).length;
  console.log(`${file}: form "${form.name}" ${form.schema.sections.length} sections, ${n} fields; template ${template.section.length} sections`);
}
process.exit(0);
