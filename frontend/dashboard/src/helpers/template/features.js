// Template editor feature switches.
//
// TEMPLATE_FORMS: binding a template to a form and building it from the form's answers (the Form
// picker, inserting form fields, and the "Form data" blocks: Repeat, Only if, Section table,
// Checklist, Declaration). Off for now, so templates are filled from data sources only. Turning it
// off only hides those tools: a template that already has a form or form blocks keeps them, they
// still render and export, and forms and submissions are unchanged. Set to true to bring them back.
export const TEMPLATE_FORMS = false;
