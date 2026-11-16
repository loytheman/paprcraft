#!/usr/bin/env bash
# Audit trail: every meaningful change to the main table is recorded, forever, in the audit-trail
# table ($AUDIT_TABLE) — who (user, IP, device, city/country), what record, which fields changed.
#   1. Turns on the main table's DynamoDB Stream (NEW_AND_OLD_IMAGES) if it isn't already.
#   2. Adds the audit table's gs3 index ("everything, newest first" for the staff view) if missing.
#   3. Creates/updates the audit Lambda ($AUDIT_LAMBDA_NAME, backend/lambda/auditTrail.js +
#      auditRow.js) and its role: read the stream, write the audit table — nothing else.
#   4. Connects the stream to the Lambda, filtered (before the Lambda even runs) to the audited
#      record types, so incidents, check results, monitor events etc. never invoke it. Batches
#      for up to 30 s: monitors are written every minute by the checker (those writes are dropped
#      by auditRow.js), so batching keeps invocations down at the cost of a short delay.
# Starts from LATEST: changes made before this runs aren't back-filled.
# Safe to re-run: each step checks what already exists.
set -euo pipefail

ENV="${1:?Usage: $0 <stg|prod>}"
source "$(dirname "$0")/_env.sh" "$ENV"
LAMBDA_SRC_DIR="$(cd "$(dirname "$0")/../lambda" && pwd)"
AWS=(--profile "$PROFILE" --region "$REGION")

# Keep in step with AUDITED in backend/lambda/auditRow.js.
AUDITED_TYPES='["Account","Label","Template","AccountMember"]'

echo "=== 1. DynamoDB Stream on $TABLE ==="
STREAM_ARN=$(aws dynamodb describe-table --table-name "$TABLE" "${AWS[@]}" --query "Table.LatestStreamArn" --output text)
STREAM_ON=$(aws dynamodb describe-table --table-name "$TABLE" "${AWS[@]}" --query "Table.StreamSpecification.StreamEnabled" --output text)
if [ "$STREAM_ON" != "True" ]; then
  aws dynamodb update-table --table-name "$TABLE" --stream-specification StreamEnabled=true,StreamViewType=NEW_AND_OLD_IMAGES "${AWS[@]}" >/dev/null
  aws dynamodb wait table-exists --table-name "$TABLE" "${AWS[@]}"
  STREAM_ARN=$(aws dynamodb describe-table --table-name "$TABLE" "${AWS[@]}" --query "Table.LatestStreamArn" --output text)
  echo "enabled: $STREAM_ARN"
else
  echo "already on: $STREAM_ARN"
fi

echo "=== 2. gs3 index on $AUDIT_TABLE ==="
if aws dynamodb describe-table --table-name "$AUDIT_TABLE" "${AWS[@]}" --query "Table.GlobalSecondaryIndexes[].IndexName" --output text | grep -qw gs3; then
  echo "already there"
else
  aws dynamodb update-table --table-name "$AUDIT_TABLE" "${AWS[@]}" \
    --attribute-definitions AttributeName=gs3pk,AttributeType=S AttributeName=gs3sk,AttributeType=S \
    --global-secondary-index-updates '[{"Create":{"IndexName":"gs3","KeySchema":[{"AttributeName":"gs3pk","KeyType":"HASH"},{"AttributeName":"gs3sk","KeyType":"RANGE"}],"Projection":{"ProjectionType":"ALL"}}}]' >/dev/null
  echo "creating (backfills in the background — the staff 'all activity' view works once it's ACTIVE)"
fi

echo "=== 3. Role $AUDIT_ROLE_NAME and Lambda $AUDIT_LAMBDA_NAME ==="
aws iam create-role --role-name "$AUDIT_ROLE_NAME" --profile "$PROFILE" \
  --assume-role-policy-document '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"lambda.amazonaws.com"},"Action":"sts:AssumeRole"}]}' >/dev/null \
  || echo "(role may already exist — safe to ignore if so)"
aws iam attach-role-policy --role-name "$AUDIT_ROLE_NAME" --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole --profile "$PROFILE" || true
aws iam put-role-policy --role-name "$AUDIT_ROLE_NAME" --policy-name "${AUDIT_ROLE_NAME}-policy" --profile "$PROFILE" --policy-document "{
  \"Version\": \"2012-10-17\",
  \"Statement\": [
    {
      \"Sid\": \"ReadMainTableStream\",
      \"Effect\": \"Allow\",
      \"Action\": [\"dynamodb:DescribeStream\", \"dynamodb:GetRecords\", \"dynamodb:GetShardIterator\", \"dynamodb:ListStreams\"],
      \"Resource\": \"arn:aws:dynamodb:${REGION}:${ACCOUNT_ID}:table/${TABLE}/stream/*\"
    },
    {
      \"Sid\": \"WriteAuditTable\",
      \"Effect\": \"Allow\",
      \"Action\": \"dynamodb:PutItem\",
      \"Resource\": \"arn:aws:dynamodb:${REGION}:${ACCOUNT_ID}:table/${AUDIT_TABLE}\"
    }
  ]
}"
sleep 10

( cd "$LAMBDA_SRC_DIR" && zip -q audit-trail.zip auditTrail.js auditRow.js )
if aws lambda get-function --function-name "$AUDIT_LAMBDA_NAME" "${AWS[@]}" >/dev/null 2>&1; then
  aws lambda update-function-code --function-name "$AUDIT_LAMBDA_NAME" --zip-file "fileb://$LAMBDA_SRC_DIR/audit-trail.zip" "${AWS[@]}" >/dev/null
  aws lambda wait function-updated-v2 --function-name "$AUDIT_LAMBDA_NAME" "${AWS[@]}"
  aws lambda update-function-configuration --function-name "$AUDIT_LAMBDA_NAME" "${AWS[@]}" \
    --handler auditTrail.handler --runtime nodejs24.x --timeout 30 --memory-size 256 \
    --environment "Variables={AUDIT_TABLE=${AUDIT_TABLE}}" >/dev/null
  echo "updated"
else
  aws lambda create-function --function-name "$AUDIT_LAMBDA_NAME" "${AWS[@]}" \
    --runtime nodejs24.x --handler auditTrail.handler --timeout 30 --memory-size 256 \
    --role "arn:aws:iam::${ACCOUNT_ID}:role/${AUDIT_ROLE_NAME}" \
    --zip-file "fileb://$LAMBDA_SRC_DIR/audit-trail.zip" \
    --environment "Variables={AUDIT_TABLE=${AUDIT_TABLE}}" >/dev/null
  echo "created"
fi
rm -f "$LAMBDA_SRC_DIR/audit-trail.zip"
aws lambda wait function-updated-v2 --function-name "$AUDIT_LAMBDA_NAME" "${AWS[@]}"

echo "=== 4. Stream -> Lambda trigger ==="
FILTERS=$(python3 -I -c '
import json, sys
types = json.loads(sys.argv[1])
pat = lambda image: json.dumps({"dynamodb": {image: {"_type": {"S": types}}}})
print(json.dumps({"Filters": [{"Pattern": pat("NewImage")}, {"Pattern": pat("OldImage")}]}))' "$AUDITED_TYPES")
EXISTING=$(aws lambda list-event-source-mappings --function-name "$AUDIT_LAMBDA_NAME" --event-source-arn "$STREAM_ARN" "${AWS[@]}" --query "EventSourceMappings[0].UUID" --output text)
if [ "$EXISTING" != "None" ] && [ -n "$EXISTING" ]; then
  aws lambda update-event-source-mapping --uuid "$EXISTING" --filter-criteria "$FILTERS" \
    --batch-size 100 --maximum-batching-window-in-seconds 30 "${AWS[@]}" >/dev/null
  echo "updated $EXISTING"
else
  aws lambda create-event-source-mapping --function-name "$AUDIT_LAMBDA_NAME" "${AWS[@]}" \
    --event-source-arn "$STREAM_ARN" --starting-position LATEST \
    --batch-size 100 --maximum-batching-window-in-seconds 30 --maximum-retry-attempts 20 --bisect-batch-on-function-error \
    --function-response-types ReportBatchItemFailures \
    --filter-criteria "$FILTERS" >/dev/null
  echo "created"
fi

aws lambda list-event-source-mappings --function-name "$AUDIT_LAMBDA_NAME" "${AWS[@]}" \
  --query "EventSourceMappings[].{State:State,Batch:BatchSize,Window:MaximumBatchingWindowInSeconds,Source:EventSourceArn}" --output table
