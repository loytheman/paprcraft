// Imports the master templates in src/scripts/masters/*.json (staff-managed templates every account
// can clone) into the env's table. Skips a master whose name already exists, so it is safe to
// re-run. Dry run unless --apply. Rebuild the JSON with frontend/dashboard/scripts/build-master-seeds.mjs.
// Also imports masters/forms/*.json ({ form, template }): the master form plus its output template,
// bound to each other, and publishes the form so accounts can clone it.
//   NODE_ENV=development STAGE_ENV=stage AWS_PROFILE=paprcraft-dev-loy node src/scripts/seed-master-templates.js
//   ... node src/scripts/seed-master-templates.js --apply
import { readdirSync, readFileSync } from "node:fs";
import { MASTER_ACCOUNT_ID } from "../models/model.template.js";
import { createTemplate, listTemplates, updateTemplate } from "../services/service.template.js";
import { createForm, listForms, updateForm, publishForm } from "../services/service.form.js";

const apply = process.argv.includes("--apply");
const log = (...a) => process.stderr.write(a.join(" ") + "\n");
const dir = new URL("./masters/", import.meta.url);

await new Promise((r) => setTimeout(r, 300)); // models load asynchronously
const existing = new Set((await listTemplates(MASTER_ACCOUNT_ID)).map((t) => t.name));
for (const f of readdirSync(dir).filter((n) => n.endsWith(".json")).sort()) {
  const t = JSON.parse(readFileSync(new URL(f, dir), "utf8"));
  if (existing.has(t.name)) { log(`skip   ${t.name} (already there)`); continue; }
  log(`${apply ? "create" : "would create"} ${t.name}: ${t.section.length} sections`);
  if (apply) await createTemplate(t, MASTER_ACCOUNT_ID, { actionBy: { name: "seed-master-templates script", userId: null }, auditStreamId: `seed-${Date.now()}` });
}

// Master forms with their templates.
const formsDir = new URL("./masters/forms/", import.meta.url);
const stamp = { actionBy: { name: "seed-master-templates script", userId: null }, auditStreamId: `seed-${Date.now()}` };
const existingForms = new Set((await listForms(MASTER_ACCOUNT_ID)).map((f) => f.name));
const blame = () => ({ ...stamp, auditStreamId: `seed-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` });
for (const f of readdirSync(formsDir).filter((n) => n.endsWith(".json")).sort()) {
  const { form, template } = JSON.parse(readFileSync(new URL(f, formsDir), "utf8"));
  if (existingForms.has(form.name)) { log(`skip   form ${form.name} (already there)`); continue; }
  log(`${apply ? "create" : "would create"} form ${form.name}: ${form.schema.sections.length} sections, with template ${template.name}`);
  if (!apply) continue;
  const t = await createTemplate(template, MASTER_ACCOUNT_ID, blame());
  const created = await createForm(form, MASTER_ACCOUNT_ID, blame());
  await updateForm({ id: created.id, templateId: t.id }, MASTER_ACCOUNT_ID, blame());
  await updateTemplate({ id: t.id, formId: created.id }, MASTER_ACCOUNT_ID, blame());
  await publishForm(created.id, MASTER_ACCOUNT_ID, blame());
}
log(apply ? "Done." : "Dry run, add --apply.");
process.exit(0);
