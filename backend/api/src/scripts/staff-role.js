// Gives an account Paprcraft staff access (role "administrator": the /staff console and every
// requireAdmin() route), or takes it away with --remove. Run by hand only: no screen can grant it.
// The person signs out and in again for it to apply (the role travels in their sign-in token).
//
// Usage (from backend/api, with AWS credentials for the env). Dry run unless --apply:
//   NODE_ENV=development STAGE_ENV=stage AWS_PROFILE=paprcraft-dev-loy node src/scripts/staff-role.js you@example.com
//   NODE_ENV=development STAGE_ENV=stage AWS_PROFILE=paprcraft-dev-loy node src/scripts/staff-role.js you@example.com --apply
//   ... staff-role.js someone@example.com --remove --apply
import { getOneTable } from "../services/index.js";
import Utils from "../helpers/utils.js";

const args = process.argv.slice(2);
const email = args.find((a) => !a.startsWith("--"))?.trim().toLowerCase();
const apply = args.includes("--apply");
const remove = args.includes("--remove");
const log = (...a) => process.stderr.write(a.join(" ") + "\n");

if (!email) {
  log("Usage: node src/scripts/staff-role.js <email> [--remove] [--apply]");
  process.exit(1);
}
await new Promise((r) => setTimeout(r, 300)); // models load asynchronously
const accounts = getOneTable().getModel("Account");
const account = await accounts.get({ email }, { index: "gs2", follow: true });
if (!account) {
  log(`No account with the email ${email}. They need to sign up first.`);
  process.exit(1);
}
const role = remove ? "user" : "administrator";
log(`${account.email} (${account.id}): role ${account.role ?? "user"} -> ${role}${apply ? "" : "  [dry run, add --apply]"}`);
if (apply && account.role !== role) {
  await accounts.update(
    { id: account.id },
    { set: { role, updatedBy: { userId: null, name: "staff-role script", email: null }, auditStreamId: Utils.ulid() } },
  );
  log("Done. They need to sign out and in again.");
}
process.exit(0);
