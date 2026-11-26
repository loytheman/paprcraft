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
// The layout follows the corpsec CDD form (infra/word-to-pdf/docx template/case.individual.js and
// case.company.js): shaded section tables with label-over-value cells, numbered checklists with Yes/No
// checkboxes, a declaration box, a "Case Reference" page header and "Page n/m" footer.
const quill = () => { const el = document.createElement('div'); document.body.appendChild(el); return new Q.Quill(el, { formats: Q.EDITOR_FORMATS, modules: { toolbar: false } }); };
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
const repeat = (group, list) => ({ id: nanoid(), type: 'repeat', item: { group, list } });

// form-table: rows of cells. c(label, value, col?) is a label-over-value cell; v(value, col?) a bare bold value;
// head(text, col) a small column title; list(label, value) a numbered list of an array answer.
const c = (label, value, col) => ({ label, value, ...(col && { col }) });
const v = (value, col) => ({ value, ...(col && { col }) });
const head = (value, col) => ({ value, head: true, ...(col && { col }) });
const lst = (label, value) => ({ label, value, list: true });
const row = (...cells) => ({ cells });
const rep = (group, ...cells) => ({ repeat: group, cells });
const stack = (...cells) => ({ stack: true, cells });
const ftable = (title, rows) => ({ id: nanoid(), type: 'form-table', item: { title, rows } });
const checklistBlock = (title, subtitle, key, list) => ({ id: nanoid(), type: 'form-checklist', item: { title, ...(subtitle && { subtitle }), rows: questions(list).map((text, i) => ({ text, value: `{{${key}.q${i + 1}}}` })) } });
const declaration = () => ({ id: nanoid(), type: 'form-declaration', item: { signer: '{{declaration_signature}}' } });
const title = (t) => para(t, { bold: true });
const preamble = (kind) => [title(`Customer Due Diligence Form (${kind})`), para('This form is for the use of: {{firm_name}}', { size: 'sm' }), blank()];
const FRAME = { headerLeft: 'Customer Due Diligence Form', headerRight: 'Case Reference: {{submission_ref}}', footerLeft: '{{firm_name}}' };

const individualCheck = () => ({ id: nanoid(), type: 'form-checklist', item: { title: 'Checklist', rows: C.individualCheckList.map((q) => ({ text: q.key, value: `{{parties_individual.p_${q.value.replace(/Flag$/, '').replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`)}}}` })) } });
const companyCheck = () => ({ id: nanoid(), type: 'form-checklist', item: { title: 'Checklist', rows: C.companyCheckList.map((q) => ({ text: q.key, value: '{{parties_company.c_registrable_controller}}' })) } });

const partiesSection = () => ({ name: 'Associated parties', list: [
  repeat('parties_company', [
    ftable('Associated Party (Company Information)', [
      row(c('Entity Name', '{{parties_company.c_name|upper}}')), row(c('Unique Entity No.', '{{parties_company.c_uen|upper}}'), c('Country of Incorporation', '{{parties_company.c_country|country|upper}}')),
      row(c('Date of Incorporation', '{{parties_company.c_inc_date|date}}')), row(c('Registered Address', '{{parties_company.c_address|upper}}')), row(c('Remarks', '{{parties_company.c_remarks}}')),
    ]),
    blank(), companyCheck(), blank(), declaration(), blank(),
  ]),
  repeat('parties_individual', [
    ftable('Associated Party (Individual Information)', [
      row(c('Full Name', '{{parties_individual.p_name|upper}}'), c('Role', '{{parties_individual.p_role|upper}}')),
      row(c('Identification No', '{{parties_individual.p_id_no|upper}}'), c('Nationality', '{{parties_individual.p_nationality|country|upper}}')),
      row(c('Shareholding (%)', '{{parties_individual.p_share_pct}}')),
    ]),
    blank(), individualCheck(), blank(), declaration(), blank(),
  ]),
] });

const reviewBlocks = () => [
  ftable('Risk Assessment Review', [
    row(c('Risk Assessment Rating', '{{risk_rating|upper}}')), row(c('Risk Assessment Comment', '{{risk_comment}}')),
    row(c('Acceptance of Customer', '{{recommendation|upper}}', 3), c('Recommending Officer', '{{recommending_officer|upper}}', 9)), row(c('Recommendation Comment', '{{recommendation_comment}}')),
    row(c('Approval for Acceptance', '{{approval|upper}}', 3), c('Approving Officer', '{{approving_officer|upper}}', 9)), row(c('Approval Comment', '{{approval_comment}}')),
  ]),
  blank(),
  ftable('Screening', [row(c('Screening results and notes', '{{screening_notes}}'))]),
];

const individualTemplate = () => ({ name: 'CDD: Individual', style: 'form', frame: FRAME, placeholders: { firm_name: '' }, section: [
  { name: 'Customer information', list: [
    ...preamble('for Individual'),
    ftable('Customer Information', [
      row(c('Full Name', '{{full_name|upper}}'), c('Gender', '{{gender|upper}}')), row(c('Identification No', '{{id_no|upper}}'), c('Expiry Date of ID', '{{id_expiry|date}}')),
      row(c('Nationality', '{{nationality|country|upper}}'), c('Date of Birth', '{{dob|date}}')), row(c('Address', '{{address|upper}}')), row(c('Email', '{{email|upper}}'), c('Contact Number', '{{contact_no}}')),
    ]),
    ftable('Case Information', [stack(lst('Nature of Services Provided', '{{services}}'), c('Remarks', '{{remarks}}'))]),
    declaration(),
  ] },
  partiesSection(),
  { name: 'Risk assessment', list: [checklistBlock('Risk Assessment Checklist', 'Customer Risk Assessment', 'risk_customer', C.riskCustomer), blank(), ...reviewBlocks()] },
] });

const companyTemplate = () => ({ name: 'CDD: Company', style: 'form', frame: FRAME, placeholders: { firm_name: '' }, section: [
  { name: 'Customer information', list: [
    ...preamble('for Company'),
    ftable('Customer Information', [
      row(c('Entity Name', '{{entity_name|upper}}')), row(c('Former Names', '{{former_names|upper}}')), row(c('Unique Entity No.', '{{uen|upper}}'), c('Entity Type', '{{entity_type|upper}}')),
      row(c('Country of Incorporation', '{{inc_country|country|upper}}'), c('Date of Incorporation', '{{inc_date|date}}')), row(c('Registered Address', '{{reg_address|upper}}')), row(c('Primary Activity', '{{primary_activity|upper}}')),
    ]),
    ftable('Case Information', [stack(lst('Nature of Services Provided', '{{services}}'), c('Remarks', '{{remarks}}'))]),
  ] },
  { name: 'Shareholders and officers', list: [
    ftable('Company Officers Information', [row(head('Name', 5), head('Id / Register No.', 3), head('Position / Role', 4)), rep('directors', v('{{directors.d_name|upper}}', 5), v('{{directors.d_id|upper}}', 3), v('{{directors.d_role|upper}}', 4))]),
    blank(),
    ftable('Shareholders Information', [row(head('Type', 2), head('Name', 4), head('Id / Register No.', 2), head('Share Type', 2), head('Share Ownership', 2)), rep('shareholders', v('{{shareholders.sh_type|upper}}', 2), v('{{shareholders.sh_name|upper}}', 4), v('{{shareholders.sh_id|upper}}', 2), v('{{shareholders.sh_class|upper}}', 2), v('{{shareholders.sh_pct}}%', 2))]),
    blank(), declaration(),
  ] },
  partiesSection(),
  { name: 'Risk assessment', list: [
    checklistBlock('Risk Assessment Checklist', 'Customer Risk Assessment', 'risk_customer', C.riskCustomer), blank(),
    checklistBlock('Risk Assessment Checklist', 'Client Risk Assessment', 'risk_client', C.riskClient), blank(),
    checklistBlock('Risk Assessment Checklist', 'Country Risk Assessment', 'risk_country', C.riskCountry), blank(),
    checklistBlock('Risk Assessment Checklist', 'Service Risk Assessment', 'risk_service', C.riskService), blank(),
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
  const BUILT_IN = new Set(['firm_name', 'submission_ref', 'submission_title', 'generated_date', 'form_name']);
  const bad = [];
  for (const m of JSON.stringify(template).matchAll(/"text":"([^"|]+)(?:\|[a-z]+)?","value":""/g)) {
    const [base, sub] = m[1].split('.');
    const ok = BUILT_IN.has(base) || (sub === undefined ? keys.has(base) : (groupFields[base]?.has(sub) || (sub !== '#' && keys.has(base))));
    if (!ok) bad.push(m[1]);
  }
  for (const m of JSON.stringify(template).matchAll(/\{\{([^}|]+)(?:\|[a-z]+)*\}\}/g)) {
    const [base, sub] = m[1].split('.');
    if (BUILT_IN.has(base)) continue;
    if (!keys.has(base)) bad.push(m[1]);
    else if (sub !== undefined && sub !== '#' && !groupFields[base]?.has(sub) && !(form.schema.sections.some((sec) => sec.fields.some((f) => f.key === base && f.type === 'checklist' && f.options.some((o) => o.value === sub))))) bad.push(m[1]);
  }
  if (bad.length) { console.error(`${form.name}: template points at unknown fields: ${[...new Set(bad)].join(', ')}`); process.exit(1); }
  writeFileSync(new URL(file, outDir), JSON.stringify({ form, template }, null, 2) + '\n');
  const n = E.allFields(form.schema).length;
  console.log(`${file}: form "${form.name}" ${form.schema.sections.length} sections, ${n} fields; template ${template.section.length} sections`);
}
process.exit(0);
