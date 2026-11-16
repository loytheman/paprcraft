# Dynamic forms feature (CDD as the first use)

Status: plan, nothing built. Decisions made with the owner:
- Filled by account users **and external customers via a link**.
- Workflow: **simple status** (draft, submitted, approved / rejected) with one decision + comment.
- Output: **reuse document templates** (upgrade the engine); forms feed placeholders.
- v1 field types: basics, **repeating groups**, **conditional visibility**, **file upload + signature**.

## 1. Concepts

| Thing | What it is |
| --- | --- |
| Form | A definition an account builds: sections of fields. Versioned; published versions are immutable. |
| Submission | One filled-in form: values, status, a snapshot of the schema it was filled against. |
| Output template | A document template (existing feature) bound to the form; its placeholders are the field keys. |
| Public link | A tokenised URL where an external customer fills and signs a submission. |

The CDD form is then a **master form + master template** (staff-published, cloneable like the AGM masters), not
hard-coded layout code. Corpsec's `case.individual.js` / `case.company.js` go away.

## 2. Data model (DynamoDB / OneTable, account scoped, same patterns as Template)

**Form** `#FORM:<id>`: accountId (or `MASTER`), name, description, `schema` (see below), `version`, status
(draft | published), `templateId` (output binding), settings (`publicEnabled`, `requireApprovedToExport`),
keywordSearch, audit stamps.

**FormSubmission** `#SUBMISSION:<id>`, gs0 by account, gs1 by form: accountId, formId, formName, `schema`
(snapshot at creation, so later form edits never break it), `values`, status, `submittedAt/By`,
`decidedAt/By`, `decisionComment`, `attachments[]`, `signature` {name, at, ip, userAgent, consentText},
`publicToken` (stored only as SHA-256 hash) + `publicExpiresAt` + `publicLockedAt`, `exportHistory[]`.

**Schema** (JSON):
```
sections: [{ id, title, description?, visibleIf?, fields: [Field] }]
Field = { id, key, type, label, help?, required?, internal?, sensitive?, options?, default?,
          visibleIf?, group?: { fields: [Field], min?, max? } }
types: text | longtext | number | date | select | multiselect | yesno | checklist | country
       | email | phone | file | signature | group
visibleIf = { key, op: eq|neq|in|empty|notEmpty|gt|lt, value } or { all|any: [visibleIf] }
```
`key` is the placeholder name. `internal` fields never appear on the public link (officer notes, risk rating).
`sensitive` fields (ID numbers...) are masked in logs and excluded from the audit trail (see risks).

## 3. Shared form engine

One pure module (no AWS, no framework): `visible(schema, values)`, `validate(schema, values, {mode})`,
`flatten(schema, values)` (to template data), and formatters. It lives in `backend/api/src/helpers/formEngine.js`,
is copied into `backend/lambda/` (Lambda zips are separate) and mirrored in `frontend/design-system/lib/forms.js`.
Shared JSON test vectors keep the three copies identical. Hidden fields are dropped on save, required rules
apply only to visible fields, groups obey min/max, selects must match options, sizes are capped.

## 4. API (backend/api)

Account (auth, viewers read-only):
- `GET/POST /forms`, `GET/PUT/DELETE /form/:id`, `POST /form/:id/publish`, `POST /form/:id/duplicate`,
  `GET /form-masters`, `POST /form/clone-master`.
- `GET /submissions?formId&status`, `POST /submission {formId}`, `GET/PUT/DELETE /submission/:id`
  (PUT = save draft values), `POST /submission/:id/submit`, `/approve`, `/reject {comment}`, `/reopen`.
- `POST /submission/:id/link {email?, expiresInDays}` (creates the token, optionally emails it), `DELETE .../link`.
- `POST /submission/:id/attachment-url` (presigned PUT, reuse `service.attachment.js`), `POST /submission/generate`
  (reuses the template export flow; the Lambda reads the submission itself).
- Staff: `/staff/master-forms` CRUD.

Public (no auth; token is the credential; CORS open for `/public/*`; rate limited with the DynamoDB limiter):
- `GET /public/form/:token` (non-internal schema + values), `PUT /public/form/:token` (save draft),
  `POST /public/form/:token/attachment-url`, `POST /public/form/:token/submit` (validates, records the
  signature with consent text, IP, user agent, then locks the link).

Status machine: draft -> submitted (account user or customer) -> approved | rejected; rejected -> draft via
reopen. Approve/reject needs owner or member role. Every transition is audited. Plan limits: `formLimit`,
`submissionLimit` (per account).

## 5. Template engine upgrade (backend/lambda docxRender + dashboard editor)

The renderer today substitutes single `{{KEY}}`. Add:
- `{{key|format}}` pipes: `yesno` (checkbox glyphs), `date` (`08 AUG 2024`), `upper`, `country`, `list`.
- **repeat** container block `{ type: 'repeat', group: 'shareholders', list: [blocks] }`: renders its blocks once
  per row; inside, `{{shareholders.name}}` resolves to the row.
- **if** container block `{ type: 'if', cond: visibleIf, list: [blocks] }`.
- Table binding: a table block marked `repeatRows` repeats its last row per group row.
- Data in: the Lambda receives `{ templateId, submissionId, cbId }`, loads both from DynamoDB, runs `flatten` and
  renders. Export history lands on the submission. Editor side: two new container blocks (nested editor),
  a "insert field" picker listing the bound form's keys, and a pipe selector on chips.

## 6. Public fill app (frontend/public-form)

A small separate Vue app (design-system, no router needs beyond the token), hosted at `forms-stg.paprcraft.com`
and `forms.paprcraft.com` via a new `forms` site in `21-site-hosting.sh` (same bucket, folder `site-forms`).
Shows the form, autosaves drafts, uploads files with presigned URLs scoped to the token, a typed-name signature
with explicit consent text, a thank-you page, and clear errors for expired or already-submitted links.

## 7. Dashboard

Forms list + builder (sections, field editor with type-specific settings, visibleIf editor, live preview,
publish), Submissions list (filters, status chips), Submission page (renders from the snapshot schema, repeating
groups, upload, signature display, submit / approve / reject with comment, **Share link** dialog, **Generate**
panel and history), staff master forms pages, Activity categories, account-closure counts.

## 8. Seeds

`CDD: Individual` and `CDD: Company` as master forms + master templates (customer information, services checklist,
shareholders/associated parties groups, declaration + signature, internal risk-assessment section marked `internal`).
Entities named in the "for the use of" line become form fields / account settings, not hard-coded text.

## 9. Phases (each ends deployed to stg with tests)

1. Form engine + Form model/service/routes + tests.
2. Submission model/service/status machine + attachments + audit + closure + limits + tests.
3. Dashboard: builder.
4. Dashboard: submission fill / review.
5. Template engine upgrade (pipes, repeat, if) + editor support + tests.
6. Generate from submission + export history.
7. Public link API + public form app + infra (`forms` site, rate limiter wiring, SES invite email).
8. CDD master forms + templates; polish.

## 10. Risks and decisions to confirm

- **PII in the audit trail.** The trail stores field-level diffs. Submission `values` (ID numbers, addresses) must
  not be stored there: audit only status transitions and who/when, add `values`, `signature`, `attachments` to
  `IGNORED_FIELDS`. Mask `sensitive` fields in API logs. Must be done in phase 2, not later.
- **Public endpoints are abuse targets**: random 256-bit tokens (hash stored), expiry, single use after submit,
  rate limit per IP and token, size caps, no enumeration, generic errors. Consider a CAPTCHA later.
- **Signature legality**: a typed name + timestamp + IP is an acknowledgement, not a qualified e-signature. State
  this in the consent text; real e-sign is out of scope.
- **Schema editing vs live submissions**: snapshot on create; "publish" creates a new version; open submissions
  keep their snapshot. Optional "migrate" action later.
- **Editor complexity**: nested container blocks (repeat/if) are the riskiest UI. Build and test them in phase 5
  before anything depends on them.
- **Out of v1**: sanctions screening, cross-record lookups, PDF output (LibreOffice container Lambda, see the
  corpsec `func-libreoffice` notes), multi-step approval, analytics, e-sign.
