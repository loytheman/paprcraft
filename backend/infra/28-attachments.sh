#!/usr/bin/env bash
# Storage for images attached to reminders (backend/api/src/services/service.attachment.js).
#   1. $STORAGE_BUCKET: private (all public access blocked, BucketOwnerEnforced), SSE-S3.
#   2. CORS: the dashboard may PUT to the presigned upload links (and GET the presigned view links)
#      from its own origins only. stg also allows the local dev dashboard.
#   3. Lifecycle: tmp/ (uploads not yet saved on a reminder) expires after 1 day; unfinished
#      multipart uploads are cleaned up after 1 day.
# The API role's access to this bucket is in 09-api-lambda-role.sh. Safe to re-run: every step
# re-applies its whole configuration.
set -euo pipefail

ENV="${1:?Usage: $0 <stg|prod>}"
source "$(dirname "$0")/_env.sh" "$ENV"

echo "=== 1. Bucket $STORAGE_BUCKET ==="
if aws s3api head-bucket --bucket "$STORAGE_BUCKET" --profile "$PROFILE" --region "$REGION" 2>/dev/null; then
  echo "already there"
else
  aws s3api create-bucket --bucket "$STORAGE_BUCKET" --profile "$PROFILE" --region "$REGION" \
    --create-bucket-configuration "LocationConstraint=$REGION" --object-ownership BucketOwnerEnforced >/dev/null
  echo "created"
fi
aws s3api put-public-access-block --bucket "$STORAGE_BUCKET" --profile "$PROFILE" --region "$REGION" \
  --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
aws s3api put-bucket-encryption --bucket "$STORAGE_BUCKET" --profile "$PROFILE" --region "$REGION" \
  --server-side-encryption-configuration '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"},"BucketKeyEnabled":true}]}'

echo "=== 2. CORS ==="
ORIGINS=""
for d in $DASHBOARD_DOMAINS; do ORIGINS="${ORIGINS:+$ORIGINS,}\"https://$d\""; done
[ "$ENV" = "stg" ] && ORIGINS="$ORIGINS,\"https://localhost:6199\",\"https://localhost:6100\""
aws s3api put-bucket-cors --bucket "$STORAGE_BUCKET" --profile "$PROFILE" --region "$REGION" --cors-configuration "{
  \"CORSRules\": [{
    \"AllowedOrigins\": [$ORIGINS],
    \"AllowedMethods\": [\"PUT\", \"GET\"],
    \"AllowedHeaders\": [\"Content-Type\"],
    \"MaxAgeSeconds\": 3000
  }]
}"
echo "origins: $ORIGINS"

echo "=== 3. Lifecycle ==="
aws s3api put-bucket-lifecycle-configuration --bucket "$STORAGE_BUCKET" --profile "$PROFILE" --region "$REGION" --lifecycle-configuration '{
  "Rules": [
    {"ID": "expire-unsaved-uploads", "Status": "Enabled", "Filter": {"Prefix": "tmp/"}, "Expiration": {"Days": 1}},
    {"ID": "abort-incomplete-multipart", "Status": "Enabled", "Filter": {}, "AbortIncompleteMultipartUpload": {"DaysAfterInitiation": 1}}
  ]
}'
aws s3api get-bucket-lifecycle-configuration --bucket "$STORAGE_BUCKET" --profile "$PROFILE" --region "$REGION" --query 'Rules[].[ID,Status]' --output text
echo "Done. Re-run 09-api-lambda-role.sh $ENV if the API role doesn't have this bucket yet."
