# Shared stg/prod resource naming for infra/*.sh. Not directly executable — sourced as:
#   source "$(dirname "$0")/_env.sh" "$ENV"
# Naming isn't uniform across resource types on purpose: S3/DynamoDB use "stage"/"prod" and
# Lambda/IAM use "stg"/"prod" (the scheme the reference project, othpulse, was built with).

ENV="${1:?Usage: source _env.sh <stg|prod>}"

# TODO: BASE_DOMAIN is a placeholder. Set it to the real domain (and create/delegate its Route 53
# public hosted zone) before running 04-ses-identity, 05-acm-cert, 07-api-custom-domain and
# 21-site-hosting: they need real DNS. Everything else (tables, API, Lambda) works without it.
BASE_DOMAIN="paprcraft.com"

case "$ENV" in
  stg)
    NAME_PREFIX="stage"
    SES_DOMAIN="stg.${BASE_DOMAIN}"
    API_DOMAIN="api-stg.${BASE_DOMAIN}"
    # Space-separated: the first is the canonical host. Shares a name with SES_DOMAIN (A/AAAA
    # alias here vs. MX/TXT there), which DNS allows.
    LANDING_DOMAINS="stg.${BASE_DOMAIN}"
    DASHBOARD_DOMAINS="dashboard-stg.${BASE_DOMAIN}"
    # Customer form links (frontend/public-form): https://forms[-stg].<domain>/f/<token>
    FORMS_DOMAINS="forms-stg.${BASE_DOMAIN}"
    ;;
  prod)
    NAME_PREFIX="prod"
    SES_DOMAIN="${BASE_DOMAIN}"
    API_DOMAIN="api.${BASE_DOMAIN}"
    LANDING_DOMAINS="${BASE_DOMAIN} www.${BASE_DOMAIN}"
    DASHBOARD_DOMAINS="dashboard.${BASE_DOMAIN}"
    FORMS_DOMAINS="forms.${BASE_DOMAIN}"
    ;;
  *)
    echo "Unknown env '$ENV' — expected 'stg' or 'prod'" >&2
    return 1 2>/dev/null || exit 1
    ;;
esac

PROFILE="paprcraft-dev-loy"
REGION="ap-southeast-1"
# TODO: fill in after `aws sso login --profile paprcraft-dev-loy`:
#   aws sts get-caller-identity --profile paprcraft-dev-loy --query Account --output text
ACCOUNT_ID="696718015220"
# Public hosted zone for the domain in this account (the registrar's NS records point at it), so
# scripts write their own DNS records instead of printing them for a human to add.
HOSTED_ZONE_NAME="${BASE_DOMAIN}"
# Frontend hosting (21-site-hosting.sh <env> <landing|dashboard|forms>): one private bucket per env,
# one folder per site, each served by its own CloudFront distribution (found by its Comment).
# Folders must match the upload-stg/upload-prod paths in frontend/*/package.json.
SITE_BUCKET="${NAME_PREFIX}.site.paprcraft"
SITE_OAC_NAME="paprcraft-${ENV}-site-oac"
LANDING_PREFIX="site-landing"
LANDING_DIST_COMMENT="paprcraft-${ENV}-landing"
DASHBOARD_PREFIX="site-dashboard"
DASHBOARD_DIST_COMMENT="paprcraft-${ENV}-dashboard"
FORMS_PREFIX="site-forms"
FORMS_DIST_COMMENT="paprcraft-${ENV}-forms"
TABLE="${NAME_PREFIX}-paprcraft-dynamo-db"
# Uploaded images (28-attachments.sh; backend/api service.attachment.js). Private; uploads land in
# tmp/ (expires after a day) and move to accounts/<id>/... when the record is saved. Matches
# AWS_S3_BUCKET in backend/api/src/.env.stage/.env.prod.
STORAGE_BUCKET="${NAME_PREFIX}.storage.paprcraft"
AUDIT_TABLE="${NAME_PREFIX}-paprcraft-dynamo-db-audit-trail"
# The API lambda (backend/api): same "-stg-"/"-prod-" naming as backend/api/package.json's
# update-lambda-stg/prod.
API_LAMBDA_NAME="paprcraft-${ENV}-api"
API_LAMBDA_ARN="arn:aws:lambda:${REGION}:${ACCOUNT_ID}:function:${API_LAMBDA_NAME}"
API_NAME="paprcraft-${ENV}-api"
API_IAM_ROLE_NAME="paprcraft-${ENV}-api-role"
API_LAYER_NAME="paprcraft-api-deps"
# Audit trail — the main table's DynamoDB Stream feeds this Lambda, which writes the audit-trail
# table (rows kept forever). See 20-audit-trail.sh, backend/lambda/auditTrail.js + auditRow.js.
AUDIT_LAMBDA_NAME="paprcraft-${ENV}-audit-trail"
AUDIT_ROLE_NAME="paprcraft-${ENV}-audit-trail-role"
# Document templates -> .docx (29-docx-template.sh, backend/lambda/docxTemplate.js). The API invokes it
# asynchronously (service.template.js); its name reaches the API as the DOCX_LAMBDA_NAME env var.
DOCX_LAMBDA_NAME="paprcraft-${ENV}-docx-template"
DOCX_ROLE_NAME="paprcraft-${ENV}-docx-template-role"
DASHBOARD_URL="https://${DASHBOARD_DOMAINS%% *}"
# Sender of system emails, on the env's verified SES domain (04-ses-identity.sh). Matches
# SES_FROM_EMAIL in backend/api/src/.env.<stage>.
NOTIFY_FROM="no-reply@${SES_DOMAIN}"
