#!/usr/bin/env bash
# Document template renderer: turns a template (sections of editor blocks) into a .docx.
#   1. Role $DOCX_ROLE_NAME: logs, dynamodb GetItem/UpdateItem on $TABLE (reads the template, or the submission + form + template, updates
#      its export entry), s3:PutObject on $STORAGE_BUCKET accounts/* (the finished file). Nothing else.
#   2. Lambda $DOCX_LAMBDA_NAME (backend/lambda/docxTemplate.js + docxRender.js + docxStyles.js and the
#      `docx` library, zipped by backend/lambda/compile-docx-template.sh): nodejs22.x, arm64, 512 MB, 60 s,
#      env TABLE and BUCKET. Invoked asynchronously by the API (service.template.js generateExport), which
#      is allowed to by 09-api-lambda-role.sh; the API learns the name from DOCX_LAMBDA_NAME (10-api-lambda-function.sh).
# When an export asks for a PDF it also invokes $PDF_LAMBDA_NAME (30-pdf-convert.sh; run that after this).
# Run order: 01 (table), 28 (bucket), then this, then 30, then 09 and 10 so the API may invoke it and knows its name.
# Later code changes: `yarn deploy-docx-template-stg|prod` in backend/lambda.
# Safe to re-run: creates what's missing, updates the policy, code and configuration of what's there.
# Needs: node, npm and zip on this machine (the build installs `docx` into the zip).
set -euo pipefail

ENV="${1:?Usage: $0 <stg|prod>}"
source "$(dirname "$0")/_env.sh" "$ENV"
LAMBDA_SRC_DIR="$(cd "$(dirname "$0")/../lambda" && pwd)"
AWS=(--profile "$PROFILE" --region "$REGION")

echo "=== 1. Role $DOCX_ROLE_NAME ==="
aws iam create-role --role-name "$DOCX_ROLE_NAME" --profile "$PROFILE" \
  --assume-role-policy-document '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"lambda.amazonaws.com"},"Action":"sts:AssumeRole"}]}' >/dev/null \
  || echo "(role may already exist — safe to ignore if so)"
aws iam attach-role-policy --role-name "$DOCX_ROLE_NAME" --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole --profile "$PROFILE" \
  || echo "(already attached — safe to ignore if so)"
aws iam put-role-policy --role-name "$DOCX_ROLE_NAME" --policy-name "${DOCX_ROLE_NAME}-policy" --profile "$PROFILE" --policy-document "{
  \"Version\": \"2012-10-17\",
  \"Statement\": [
    {
      \"Sid\": \"ReadTemplateAndUpdateExportEntry\",
      \"Effect\": \"Allow\",
      \"Action\": [\"dynamodb:GetItem\", \"dynamodb:UpdateItem\"],
      \"Resource\": \"arn:aws:dynamodb:${REGION}:${ACCOUNT_ID}:table/${TABLE}\"
    },
    {
      \"Sid\": \"StartPdfConversion\",
      \"Effect\": \"Allow\",
      \"Action\": \"lambda:InvokeFunction\",
      \"Resource\": \"arn:aws:lambda:${REGION}:${ACCOUNT_ID}:function:${PDF_LAMBDA_NAME}\"
    },
    {
      \"Sid\": \"WriteExportedDocuments\",
      \"Effect\": \"Allow\",
      \"Action\": \"s3:PutObject\",
      \"Resource\": \"arn:aws:s3:::${STORAGE_BUCKET}/accounts/*\"
    }
  ]
}"
echo "Waiting for IAM role propagation..."
sleep 10

echo "=== 2. Lambda $DOCX_LAMBDA_NAME ==="
"$LAMBDA_SRC_DIR/compile-docx-template.sh"
ZIP="$LAMBDA_SRC_DIR/docx-template.zip"
ENVIRONMENT="Variables={TABLE=${TABLE},BUCKET=${STORAGE_BUCKET},PDF_LAMBDA_NAME=${PDF_LAMBDA_NAME}}"
if aws lambda get-function --function-name "$DOCX_LAMBDA_NAME" "${AWS[@]}" >/dev/null 2>&1; then
  aws lambda update-function-code --function-name "$DOCX_LAMBDA_NAME" --zip-file "fileb://$ZIP" --architectures arm64 "${AWS[@]}" >/dev/null
  aws lambda wait function-updated-v2 --function-name "$DOCX_LAMBDA_NAME" "${AWS[@]}"
  aws lambda update-function-configuration --function-name "$DOCX_LAMBDA_NAME" "${AWS[@]}" \
    --handler docxTemplate.handler --runtime nodejs22.x --timeout 60 --memory-size 512 \
    --environment "$ENVIRONMENT" >/dev/null
  echo "updated"
else
  aws lambda create-function --function-name "$DOCX_LAMBDA_NAME" "${AWS[@]}" \
    --runtime nodejs22.x --architectures arm64 --handler docxTemplate.handler --timeout 60 --memory-size 512 \
    --role "arn:aws:iam::${ACCOUNT_ID}:role/${DOCX_ROLE_NAME}" \
    --zip-file "fileb://$ZIP" \
    --environment "$ENVIRONMENT" >/dev/null
  echo "created"
fi
rm -f "$ZIP"
aws lambda wait function-updated-v2 --function-name "$DOCX_LAMBDA_NAME" "${AWS[@]}"

# A failed async invoke is retried by AWS; the handler already marks the export failed and returns
# normally, so retries only happen for infrastructure errors. One retry is enough.
aws lambda put-function-event-invoke-config --function-name "$DOCX_LAMBDA_NAME" "${AWS[@]}" \
  --maximum-retry-attempts 1 --maximum-event-age-in-seconds 3600 >/dev/null

echo "Done. Next: 09-api-lambda-role.sh $ENV and 10-api-lambda-function.sh $ENV (the API may invoke it and learns its name)."
aws lambda get-function-configuration --function-name "$DOCX_LAMBDA_NAME" "${AWS[@]}" \
  --query "{Name:FunctionName,Runtime:Runtime,Arch:Architectures[0],Memory:MemorySize,Timeout:Timeout,Handler:Handler}" --output table
