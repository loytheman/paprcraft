// Imports the master templates in src/scripts/masters/*.json (staff-managed templates every account
// can clone) into the env's table. Skips a master whose name already exists, so it is safe to
// re-run. Dry run unless --apply. Rebuild the JSON with frontend/dashboard/scripts/build-master-seeds.mjs.
//   NODE_ENV=development STAGE_ENV=stage AWS_PROFILE=paprcraft-dev-loy node src/scripts/seed-master-templates.js
//   ... node src/scripts/seed-master-templates.js --apply
import { readdirSync, readFileSync } from "node:fs";
import { MASTER_ACCOUNT_ID } from "../models/model.template.js";
import { createTemplate, listTemplates } from "../services/service.template.js";

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
log(apply ? "Done." : "Dry run, add --apply.");
process.exit(0);
