#!/usr/bin/env bash
# PDF converter: turns a finished .docx into a .pdf with LibreOffice.
#   1. ECR repository $PDF_REPO_NAME holding the container image (backend/lambda/pdf/Dockerfile).
#   2. Role $PDF_ROLE_NAME: logs, dynamodb GetItem/UpdateItem on $TABLE (sets pdfStatus on the export entry),
#      s3 GetObject + PutObject on $STORAGE_BUCKET accounts/* (reads the .docx, writes the .pdf). Nothing else.
#   3. Lambda $PDF_LAMBDA_NAME (container image, x86_64, 2 GB, 3 GB scratch, 120 s, env TABLE and BUCKET), invoked
#      asynchronously by the docx Lambda (29-docx-template.sh grants that and sets PDF_LAMBDA_NAME).
# Run order: after 29. Later code changes: run this script again (it builds, pushes and points the Lambda at the new image).
# Safe to re-run. Needs: docker running on this machine (the image is built here, for linux/amd64).
set -euo pipefail

ENV="${1:?Usage: $0 <stg|prod>}"
source "$(dirname "$0")/_env.sh" "$ENV"
LAMBDA_SRC_DIR="$(cd "$(dirname "$0")/../lambda" && pwd)"
AWS=(--profile "$PROFILE" --region "$REGION")
REGISTRY="${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com"
TAG="$(date +%Y%m%d%H%M%S)"
IMAGE="${REGISTRY}/${PDF_REPO_NAME}:${TAG}"

echo "=== 1. ECR repository $PDF_REPO_NAME ==="
aws ecr describe-repositories --repository-names "$PDF_REPO_NAME" "${AWS[@]}" >/dev/null 2>&1 \
  || aws ecr create-repository --repository-name "$PDF_REPO_NAME" --image-scanning-configuration scanOnPush=true "${AWS[@]}" >/dev/null
# Keep the last 5 images only.
aws ecr put-lifecycle-policy --repository-name "$PDF_REPO_NAME" "${AWS[@]}" --lifecycle-policy-text '{"rules":[{"rulePriority":1,"description":"keep 5","selection":{"tagStatus":"any","countType":"imageCountMoreThan","countNumber":5},"action":{"type":"expire"}}]}' >/dev/null

echo "=== 2. Role $PDF_ROLE_NAME ==="
aws iam create-role --role-name "$PDF_ROLE_NAME" --profile "$PROFILE" \
  --assume-role-policy-document '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"lambda.amazonaws.com"},"Action":"sts:AssumeRole"}]}' >/dev/null \
  || echo "(role may already exist — safe to ignore if so)"
aws iam attach-role-policy --role-name "$PDF_ROLE_NAME" --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole --profile "$PROFILE" \
  || echo "(already attached — safe to ignore if so)"
aws iam put-role-policy --role-name "$PDF_ROLE_NAME" --policy-name "${PDF_ROLE_NAME}-policy" --profile "$PROFILE" --policy-document "{
  \"Version\": \"2012-10-17\",
  \"Statement\": [
    {
      \"Sid\": \"UpdateExportEntry\",
      \"Effect\": \"Allow\",
      \"Action\": [\"dynamodb:GetItem\", \"dynamodb:UpdateItem\"],
      \"Resource\": \"arn:aws:dynamodb:${REGION}:${ACCOUNT_ID}:table/${TABLE}\"
    },
    {
      \"Sid\": \"ReadDocxWritePdf\",
      \"Effect\": \"Allow\",
      \"Action\": [\"s3:GetObject\", \"s3:PutObject\"],
      \"Resource\": \"arn:aws:s3:::${STORAGE_BUCKET}/accounts/*\"
    }
  ]
}"
echo "Waiting for IAM role propagation..."
sleep 10

echo "=== 3. Build and push $IMAGE ==="
aws ecr get-login-password "${AWS[@]}" | docker login --username AWS --password-stdin "$REGISTRY" >/dev/null
docker build --platform linux/amd64 -t "$IMAGE" -f "$LAMBDA_SRC_DIR/pdf/Dockerfile" "$LAMBDA_SRC_DIR"
docker push "$IMAGE" >/dev/null

echo "=== 4. Lambda $PDF_LAMBDA_NAME ==="
ENVIRONMENT="Variables={TABLE=${TABLE},BUCKET=${STORAGE_BUCKET}}"
if aws lambda get-function --function-name "$PDF_LAMBDA_NAME" "${AWS[@]}" >/dev/null 2>&1; then
  aws lambda update-function-code --function-name "$PDF_LAMBDA_NAME" --image-uri "$IMAGE" "${AWS[@]}" >/dev/null
  aws lambda wait function-updated-v2 --function-name "$PDF_LAMBDA_NAME" "${AWS[@]}"
  aws lambda update-function-configuration --function-name "$PDF_LAMBDA_NAME" "${AWS[@]}" \
    --timeout 120 --memory-size 2048 --ephemeral-storage Size=3072 --environment "$ENVIRONMENT" >/dev/null
  echo "updated"
else
  aws lambda create-function --function-name "$PDF_LAMBDA_NAME" "${AWS[@]}" \
    --package-type Image --code "ImageUri=$IMAGE" --architectures x86_64 \
    --timeout 120 --memory-size 2048 --ephemeral-storage Size=3072 \
    --role "arn:aws:iam::${ACCOUNT_ID}:role/${PDF_ROLE_NAME}" \
    --environment "$ENVIRONMENT" >/dev/null
  echo "created"
fi
aws lambda wait function-updated-v2 --function-name "$PDF_LAMBDA_NAME" "${AWS[@]}"
aws lambda put-function-event-invoke-config --function-name "$PDF_LAMBDA_NAME" "${AWS[@]}" \
  --maximum-retry-attempts 0 --maximum-event-age-in-seconds 3600 >/dev/null

echo "Done."
aws lambda get-function-configuration --function-name "$PDF_LAMBDA_NAME" "${AWS[@]}" \
  --query "{Name:FunctionName,Package:PackageType,Arch:Architectures[0],Memory:MemorySize,Timeout:Timeout}" --output table
