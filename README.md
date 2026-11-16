# paprcraft
use paprcraft-dev-loy aws sso profile

Serverless boilerplate, structured like the reference project (othpulse). Rules for working in
this repo are in [CLAUDE.md](CLAUDE.md): **infrastructure is numbered AWS CLI scripts, never CDK
or CloudFormation.**

## Layout: where things go

```
backend/
  api/                 Express 5 API, runs locally (https :3006) and as one Lambda behind API Gateway
    src/
      app.js, app-local.js, app-lambda.js   app, local dev server, Lambda entry (+ scheduled tasks)
      routes/v1/index.js                    every route; one block per resource
      controllers/controller.<name>.js      thin: req -> service -> res
      services/service.<name>.js            business logic + its Joi request schema (XxxJoiSchema)
      models/model.<name>.js                OneTable schema + data access; register in models/index.js
      middlewares/                          auth, behaviour (audit stamps), errors, rate limit, CORS
      emails/                               email.layout.js (shared frame) + one file per email
      config/config.js                      reads .env.<STAGE_ENV> + .env.secret (see .env.example*)
      keys/                                 local dev TLS cert (generated, git-ignored)
      scripts/                              one-off admin scripts (not shipped to Lambda)
    test/                                   node --test (*.test.mjs)
  lambda/              Standalone Lambdas (not the API). Today: audit trail (auditTrail.js, auditRow.js) and the document-template renderer (docxTemplate.js, docxRender.js, docxStyles.js)
  infra/               Numbered AWS CLI scripts + _env.sh (naming). `<script> stg|prod`, safe to re-run
frontend/
  design-system/       Shared Tailwind v4 theme + Op* Vue components (imported as @ds/...)
  dashboard/           Signed-in Vue 3 + Vite app (https :6100)
  public-form/         Customer-facing form page opened from a form link (https :6300, /f/<token>)
  landing/             Marketing site (https :6200); design-system.html previews the DS in dev
```

What the boilerplate already includes: Google sign-in + sessions (JWT + refresh cookies), accounts,
teams (invite / roles), staff console (limits, suspend, notes, close account), account closure,
labels (a worked example of a CRUD resource: model, service, controller, routes, dashboard page),
account API keys (`pck_...`), activity feed backed by the audit trail, S3 image uploads (presigned), document templates (block editor -> .docx via a renderer Lambda, staff-managed masters),
DynamoDB-backed rate limiter (written, not wired into routes), SES email.

Deliberately left out (othpulse business logic): monitors, checks, probes, status pages, notifier,
Stripe billing. `service.plan.js` is a billing-free plan/limits skeleton (free / pro).

## Adding a resource (the pattern)

1. `models/model.thing.js` (schema + data access) and register it in `models/index.js`.
2. `services/service.thing.js` (logic, `ThingJoiSchema`) and `controllers/controller.thing.js`.
3. Routes in `routes/v1/index.js` (`auth()`, `joi(...)`, `blameableBehaviour` on writes).
4. If it should show in Activity: add its model name to `AUDITED` in `backend/lambda/auditRow.js`
   and to `AUDITED_TYPES` in `backend/infra/20-audit-trail.sh`, redeploy both, add a
   `CATEGORIES` entry in `models/model.activity.trail.js`.
5. Delete its data in `service.accountClosure.js`.
6. Dashboard: `src/services/service.thing.js`, a view, a route in `router.js`, a nav link.

## Setting up the AWS account (paprcraft-dev-loy)

```sh
aws sso login --profile paprcraft-dev-loy
aws sts get-caller-identity --profile paprcraft-dev-loy --query Account --output text
```

1. Put the account ID in `backend/infra/_env.sh` (`ACCOUNT_ID`) and the real domain in
   `BASE_DOMAIN` (set to `paprcraft.com`; the account ID is set too).
2. Run in order, each with `stg` then `prod` where it takes an env (`cd backend/infra`):

| Step | Script | Needs a real domain? |
| --- | --- | --- |
| check | `00-check-state.sh <env>` (read-only, run any time) | |
| data | `01-create-dynamodb-tables.sh`, `02-dynamodb-ttl.sh` | no |
| files | `28-attachments.sh` (S3 uploads bucket) | no |
| API | `09-api-lambda-role.sh`, `08-api-lambda-layer.sh`, `10-api-lambda-function.sh`, `06-api-gateway.sh` | no |
| audit | `20-audit-trail.sh` (needs the API's table + `backend/lambda`) | no |
| sweep | `27-staff-sweep.sh` (daily limit-override cleanup) | no |
| docx | `29-docx-template.sh` (document-template renderer; needs 01 + 28, node/npm/zip; then re-run `09` and `10` so the API may invoke it and gets `DOCX_LAMBDA_NAME`) | no |
| DNS | `05-acm-cert.sh`, `07-api-custom-domain.sh`, `04-ses-identity.sh` | yes (Route 53 zone) |
| sites | `21-site-hosting.sh <env> landing`, `... dashboard` and `... forms` | yes |

3. Create `backend/api/src/.env.stage` / `.env.prod` / `.env.local` from `.env.example` and
   `.env.secret` from `.env.example.secret`. Secrets (`JWT_USER_SECRET`, `GOOGLE_CLIENT_SECRET`)
   are Lambda env vars when deployed; `10-api-lambda-function.sh` never prints or sets them.
4. Put the CloudFront distribution IDs printed by `21-site-hosting.sh` into the `invalidate-*`
   scripts of `frontend/dashboard`, `frontend/landing` and `frontend/public-form` (`package.json`).
5. Google sign-in: create an OAuth client in Google Cloud Console, set `GOOGLE_CLIENT_ID` in the
   `.env.*` files and `GOOGLE_CLIENT_SECRET` as a secret.

## Local development

```sh
cd backend/api && yarn install && yarn dev      # https://localhost:3006 (accept the self-signed cert once)
cd frontend/dashboard && yarn install && yarn dev   # https://localhost:6100
cd frontend/landing && yarn install && yarn dev     # https://localhost:6200
cd frontend/public-form && yarn install && yarn dev # https://localhost:6300 (open /f/<token> from a form link)
```
Or in VS Code: Tasks: Run Task -> "Dev: all". The API needs AWS credentials for DynamoDB
(`yarn sso-login` in `backend/api`).

## Deploying

- API: `cd backend/api && yarn deploy` (stg) / `yarn deploy-prod`. Dependencies live in a Lambda layer: `yarn prepare-layer` then `infra/08-api-lambda-layer.sh <env>` when `package.json` deps change.
- Audit Lambda: `cd backend/lambda && yarn deploy-audit-trail-stg` / `-prod`.
- Docx renderer Lambda: `cd backend/lambda && yarn deploy-docx-template-stg` / `-prod` (builds a zip with the `docx` library).
- Frontends: `yarn deploy` / `yarn deploy-prod` in `frontend/dashboard`, `frontend/landing` or `frontend/public-form`.

## Still placeholders (search for `TODO`)

- Domain, account ID, CloudFront IDs (above).
- Landing copy (`frontend/landing/src/data/content.js`, hero, footer) and legal pages (privacy / terms were othpulse's and are not copied: write paprcraft's own).
- Logo/favicon assets are othpulse's; email logo is `frontend/dashboard/public/email/paprcraft-mark.png`.
- Plans and prices in `service.plan.js`; billing is not implemented.
- No Google Analytics tag (the reference's was othpulse's own).
