#!/usr/bin/env bash
# Creates the HTTP API (API Gateway v2) that fronts the API lambda as a full proxy: one
# Lambda proxy integration + a catch-all $default route + an auto-deploy $default stage, all
# created in a single call via --target. Then grants API Gateway permission to invoke the
# lambda. Independent of the custom domain / ACM cert (05, 07) — this alone gives a working
# https://<api-id>.execute-api.<region>.amazonaws.com/ URL to test against.
# Needs the lambda to exist first (10-api-lambda-function.sh).
# Safe to re-run: an existing API named $API_NAME is reused, not duplicated.
set -euo pipefail

ENV="${1:?Usage: $0 <stg|prod>}"
source "$(dirname "$0")/_env.sh" "$ENV"

API_ID=$(aws apigatewayv2 get-apis --profile "$PROFILE" --region "$REGION" \
  --query "Items[?Name=='${API_NAME}'].ApiId | [0]" --output text)
if [ -z "$API_ID" ] || [ "$API_ID" = "None" ]; then
  echo "Creating HTTP API $API_NAME -> $API_LAMBDA_ARN..."
  API_ID=$(aws apigatewayv2 create-api \
    --name "$API_NAME" \
    --protocol-type HTTP \
    --target "$API_LAMBDA_ARN" \
    --profile "$PROFILE" --region "$REGION" \
    --query ApiId --output text)
else
  echo "HTTP API $API_NAME exists."
fi
echo "API ID: $API_ID"

echo "Granting API Gateway permission to invoke $API_LAMBDA_NAME..."
aws lambda add-permission \
  --function-name "$API_LAMBDA_NAME" \
  --statement-id "apigateway-${ENV}-invoke" \
  --action lambda:InvokeFunction \
  --principal apigateway.amazonaws.com \
  --source-arn "arn:aws:execute-api:${REGION}:${ACCOUNT_ID}:${API_ID}/*/*" \
  --profile "$PROFILE" --region "$REGION" \
  || echo "(permission may already exist — safe to ignore if so)"

echo
echo "Default invoke URL (works now, no custom domain needed):"
aws apigatewayv2 get-api --api-id "$API_ID" --profile "$PROFILE" --region "$REGION" --query ApiEndpoint --output text
echo
echo "Run 05-acm-cert.sh and 07-api-custom-domain.sh $ENV to wire up $API_DOMAIN."
