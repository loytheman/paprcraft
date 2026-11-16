// All landing copy in one place. It describes what paprcraft does today; add claims (customers, ratings,
// certifications, prices) only once they are true. Plans and limits: PLANS in backend/api/src/services/service.plan.js.

export const navLinks = [
  { label: 'How it works', href: '#how-it-works' },
  { label: 'Features', href: '#features' },
  { label: 'Templates', href: '#templates' },
];

export const hero = {
  badge: 'Document templates · Forms · Word export',
  headlineLead: 'Forms in.',
  headlineAccent: 'Word documents',
  headlineTail: 'out.',
  body: 'Build a form, collect the answers from your team or your customers, and generate branded Word documents from your own templates. Every change is tracked.',
  facts: [
    { icon: 'send', text: 'Customer links, no login needed' },
    { icon: 'shield', text: 'Every change audited' },
    { icon: 'download', text: 'Editable .docx output' },
  ],
};

export const steps = [
  { n: '1', tag: 'Templates', title: 'Design your document template', body: 'Write it once in the block editor: text, tables, checklists, headers and signature boxes, with {{placeholders}} where the data goes.', foot: { icon: 'layout', text: 'Your layout, your wording' } },
  { n: '2', tag: 'Forms', title: 'Collect the data', body: 'Build a form with conditional questions, repeating groups and file uploads. Fill it in yourself, or send a secure link to your customer.', foot: { icon: 'send', text: 'Share a link: customers need no account' } },
  { n: '3', tag: 'Documents', title: 'Review, approve, generate', body: 'Approve the submission, then export a Word document that matches your template. Each export is kept with who made it and when.', foot: { icon: 'download', text: 'Word (.docx), ready to edit' } },
];

export const features = [
  { icon: 'layout', tag: 'Templates', title: 'Block editor for documents', body: 'Paragraphs, lists, tables, section tables, checklists with Yes/No boxes, page headers and footers, signature areas.' },
  { icon: 'braces', tag: 'Placeholders', title: 'Fields that fill themselves', body: 'Drop in {{fields}} with formats: dates, yes/no boxes, upper case, country names, lists. Repeat a block for every row of a group.' },
  { icon: 'pencil', tag: 'Forms', title: 'Dynamic forms', body: 'Fourteen field types, conditional questions, repeating groups, file uploads and a typed signature, validated on the server.' },
  { icon: 'send', tag: 'Customers', title: 'Secure customer links', body: 'A customer fills the form from a private, expiring link. Staff-only fields stay hidden, and the link locks after they submit.' },
  { icon: 'check', tag: 'Review', title: 'Approval workflow', body: 'Draft, submitted, approved or rejected, with a reason. Reopen a submission when something needs changing.' },
  { icon: 'shield', tag: 'Audit', title: 'A full audit trail', body: 'Every answer and every change to a form is recorded, with who did it, when, and from where.' },
  { icon: 'users', tag: 'Teams', title: 'Teams and roles', body: 'Invite people as members or viewers. Viewers read; members edit, approve and export.' },
  { icon: 'zap', tag: 'Ready to use', title: 'Starter templates', body: 'Master templates for customer due diligence (individual and company) and company resolutions come ready to clone and edit.' },
];

export const templates = [
  { tag: 'Compliance', fmt: '.docx', title: 'Customer due diligence: individual', body: 'Customer details, services, associated parties, a risk checklist and review, with declaration and signature.', foot: 'Form + document, linked' },
  { tag: 'Compliance', fmt: '.docx', title: 'Customer due diligence: company', body: 'Entity details, shareholders and officers, associated parties and the full risk assessment checklists.', foot: 'Repeating shareholder tables' },
  { tag: 'Corporate', fmt: '.docx', title: 'Annual meeting resolutions and notices', body: 'Resolutions, notices and minutes with the company name, dates and signers filled in for you.', foot: 'Multi-section pack' },
];

export const cta = {
  title: 'Turn your forms into finished documents',
  body: 'Sign in with Google and build your first template in minutes.',
  button: 'Get started',
};

// Legal pages (privacy / terms) are not included: add public/privacy.html and public/terms.html,
// written for paprcraft, before launch, then link them here.
export const footerColumns = [
  { title: 'Product', links: [{ label: 'How it works', href: '#how-it-works' }, { label: 'Features', href: '#features' }, { label: 'Templates', href: '#templates' }] },
];
