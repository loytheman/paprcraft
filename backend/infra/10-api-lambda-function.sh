#!/usr/bin/env bash
# Builds backend/api/src into function.zip (same recipe as backend/api/package.json's
# compile-lambda) and creates the paprcraft-{stg,prod}-api Lambda function itself, using the
# shared "paprcraft-api-deps" layer (08, published once) and the role from 09-api-lambda-role.sh.
#
# Only NODE_ENV, STAGE_ENV and JWT_USER_SECRET are set as real Lambda env vars — everything
# else, including GOOGLE_CLIENT_ID (not secret, but no need to duplicate it),
# DynamoDB tables, SES from-address, CORS, ... comes from the bundled .env.stage/.env.prod file
# at runtime via config.js's `.env.${STAGE_ENV}` lookup (its first dotenv.config() call only
# fills in keys process.env doesn't already have, so anything NOT set as an explicit Lambda env
# var here falls through to that file correctly). .env.secret is deliberately excluded from the
# zip (see compile-lambda) since it's not meant to ship in the artifact — GOOGLE_CLIENT_SECRET
# stays a real Lambda env var, set by hand, never by this script.
#
# JWT_USER_SECRET in backend/api/src/.env.secret is currently the literal placeholder "xxxxx",
# not a real secret — this script generates one the first time a given env's function is
# created, then leaves it alone on every later redeploy (rotating it on every code push would
# invalidate every session each time). To rotate deliberately, delete it from the function's
# env vars first, then re-run this script.
#
# Environment variables are MERGED with whatever's already on the function, never replaced
# wholesale — update-function-configuration's --environment flag replaces the entire map, so a
# naive version of this script would silently wipe out anything set by hand (e.g.
# GOOGLE_CLIENT_SECRET, which this script deliberately never sets — see _env.sh's comment).
#
# Runtime is nodejs22.x, not nodejs24.x (unlike the audit-trail lambda): @codegenie/serverless-
# express ^4.17.1 still uses a callback-style handler internally, which Node.js 24's Lambda
# runtime rejects outright (Runtime.CallbackHandlerDeprecated). nodejs22.x still supports it.
set -euo pipefail

ENV="${1:?Usage: $0 <stg|prod>}"
source "$(dirname "$0")/_env.sh" "$ENV"

API_SRC_DIR="$(cd "$(dirname "$0")/../api" && pwd)"

echo "Building function.zip from backend/api/src..."
rm -f "$API_SRC_DIR/function.zip"
# .env.secret never ships (secrets are Lambda env vars); keys/ is only the local HTTPS dev cert
# (app-local.js) and scripts/ are one-off CLI tools — none of it belongs in the Lambda.
( cd "$API_SRC_DIR/src" && zip -rq ../function.zip . -x "*.DS_Store" ".env.secret" ".env.local" "keys/*" "scripts/*" )
ls -lh "$API_SRC_DIR/function.zip"

echo "Looking up latest version of layer $API_LAYER_NAME..."
LAYER_ARN=$(aws lambda list-layer-versions \
  --layer-name "$API_LAYER_NAME" \
  --profile "$PROFILE" --region "$REGION" \
  --query "LayerVersions[0].LayerVersionArn" --output text)
if [ -z "$LAYER_ARN" ] || [ "$LAYER_ARN" = "None" ]; then
  echo "No published version of $API_LAYER_NAME found. Publish it first (see backend/_layer)." >&2
  exit 1
fi
echo "Layer: $LAYER_ARN"

ROLE_ARN="arn:aws:iam::${ACCOUNT_ID}:role/${API_IAM_ROLE_NAME}"
echo "Role: $ROLE_ARN"

FUNCTION_EXISTS=false
if aws lambda get-function --function-name "$API_LAMBDA_NAME" --profile "$PROFILE" --region "$REGION" >/dev/null 2>&1; then
  FUNCTION_EXISTS=true
fi

# Build the merged env var JSON with node: start from whatever's currently on the function
# (empty object if it doesn't exist yet), then set only the vars this script actually manages —
# everything else already there (GOOGLE_CLIENT_SECRET, anything added by hand) passes through
# untouched. JWT_USER_SECRET is generated once and then preserved, not rotated on every run.
CURRENT_ENV_JSON="{}"
if [ "$FUNCTION_EXISTS" = true ]; then
  CURRENT_ENV_JSON=$(aws lambda get-function-configuration \
    --function-name "$API_LAMBDA_NAME" \
    --profile "$PROFILE" --region "$REGION" \
    --query "Environment.Variables" --output json)
  [ "$CURRENT_ENV_JSON" = "null" ] && CURRENT_ENV_JSON="{}"
fi

ENV_JSON=$(node -e "
  const current = $CURRENT_ENV_JSON;
  // GOOGLE_CLIENT_ID belongs in .env.stage/.env.prod only (not secret, no need to duplicate
  // it as a Lambda env var) — drop it here so a function that still has one from before this
  // fix gets cleaned up too.
  delete current.GOOGLE_CLIENT_ID;
  const managed = {
    NODE_ENV: 'production',
    STAGE_ENV: '${NAME_PREFIX}',
    DOCX_LAMBDA_NAME: '${DOCX_LAMBDA_NAME}', // the docx renderer the API invokes (29-docx-template.sh)
    PDF_LAMBDA_NAME: '${PDF_LAMBDA_NAME}', // the PDF converter the Word to PDF page invokes (30-pdf-convert.sh)
    JWT_USER_SECRET: current.JWT_USER_SECRET || require('crypto').randomBytes(32).toString('hex'),
  };
  console.log(JSON.stringify({ ...current, ...managed }));
")
# aws cli's shorthand Variables={a=b,c=d} syntax can't express arbitrary values safely —
# --environment takes a JSON document directly instead.
ENVIRONMENT_ARG=$(node -e "console.log(JSON.stringify({ Variables: $ENV_JSON }))")

# Memory is set on every run. The API peaks around 250 MB; 1024 MB leaves headroom and enough CPU
# (Lambda CPU scales with memory), where the 3008 MB it once had was ~12x what it used and Lambda
# bills memory x time. The timeout is left as it is on updates.
MEMORY_MB=1024

if [ "$FUNCTION_EXISTS" = true ]; then
  echo "$API_LAMBDA_NAME already exists — updating code and config instead of creating."
  aws lambda update-function-code \
    --function-name "$API_LAMBDA_NAME" \
    --zip-file "fileb://$API_SRC_DIR/function.zip" \
    --profile "$PROFILE" --region "$REGION" >/dev/null
  aws lambda wait function-updated --function-name "$API_LAMBDA_NAME" --profile "$PROFILE" --region "$REGION"
  aws lambda update-function-configuration \
    --function-name "$API_LAMBDA_NAME" \
    --runtime nodejs22.x \
    --role "$ROLE_ARN" \
    --layers "$LAYER_ARN" \
    --memory-size "$MEMORY_MB" \
    --environment "$ENVIRONMENT_ARG" \
    --profile "$PROFILE" --region "$REGION" >/dev/null
else
  echo "Creating $API_LAMBDA_NAME..."
  aws lambda create-function \
    --function-name "$API_LAMBDA_NAME" \
    --runtime nodejs22.x \
    --architectures x86_64 \
    --handler app-lambda.handler \
    --role "$ROLE_ARN" \
    --layers "$LAYER_ARN" \
    --timeout 15 \
    --memory-size "$MEMORY_MB" \
    --zip-file "fileb://$API_SRC_DIR/function.zip" \
    --environment "$ENVIRONMENT_ARG" \
    --profile "$PROFILE" --region "$REGION" >/dev/null
  aws lambda wait function-active --function-name "$API_LAMBDA_NAME" --profile "$PROFILE" --region "$REGION"
fi

echo "Granting API Gateway permission to invoke $API_LAMBDA_NAME..."
API_ID=$(aws apigatewayv2 get-apis \
  --profile "$PROFILE" --region "$REGION" \
  --query "Items[?Name=='${API_NAME}'].ApiId | [0]" --output text)
if [ -n "$API_ID" ] && [ "$API_ID" != "None" ]; then
  aws lambda add-permission \
    --function-name "$API_LAMBDA_NAME" \
    --statement-id "apigateway-${ENV}-invoke" \
    --action lambda:InvokeFunction \
    --principal apigateway.amazonaws.com \
    --source-arn "arn:aws:execute-api:${REGION}:${ACCOUNT_ID}:${API_ID}/*/*" \
    --profile "$PROFILE" --region "$REGION" \
    || echo "(permission may already exist — safe to ignore if so)"
else
  echo "No HTTP API named $API_NAME found yet — run 06-api-gateway.sh $ENV, then re-run this script." >&2
fi

echo
echo "Done. Env vars merged (JWT_USER_SECRET preserved if it already existed, GOOGLE_CLIENT_SECRET"
echo "left untouched if you set it manually). Read the full current set with:"
echo "  aws lambda get-function-configuration --function-name $API_LAMBDA_NAME --profile $PROFILE --region $REGION --query Environment.Variables"
if ! echo "$CURRENT_ENV_JSON" | grep -q GOOGLE_CLIENT_SECRET; then
  echo "Reminder: GOOGLE_CLIENT_SECRET is not set on $API_LAMBDA_NAME yet — Sign in with Google won't work until you add it (this script never sets it)."
fi
