#!/usr/bin/env bash
# Daily staff sweep: removes custom limits that have passed their end date
# (backend/api/src/services/service.staff.js expireLimitOverrides). Runs in
# the API Lambda ($API_LAMBDA_NAME), which EventBridge Scheduler invokes directly with
# {"task":"expire-limit-overrides"} (app-lambda.js), at 01:00 Singapore time.
#   1. Scheduler role: may invoke the API Lambda, nothing else.
#   2. The schedule.
# Safe to re-run: creates what's missing, updates what's there.
set -euo pipefail

ENV="${1:?Usage: $0 <stg|prod>}"
source "$(dirname "$0")/_env.sh" "$ENV"

ROLE_NAME="paprcraft-${ENV}-staff-sweep-scheduler"
SCHEDULE_NAME="paprcraft-${ENV}-staff-sweep"

echo "=== 1. Role $ROLE_NAME ==="
NEW_ROLE=false
if ! aws iam get-role --role-name "$ROLE_NAME" --profile "$PROFILE" >/dev/null 2>&1; then
  aws iam create-role --role-name "$ROLE_NAME" --profile "$PROFILE" >/dev/null \
    --assume-role-policy-document "{
      \"Version\": \"2012-10-17\",
      \"Statement\": [{
        \"Effect\": \"Allow\",
        \"Principal\": {\"Service\": \"scheduler.amazonaws.com\"},
        \"Action\": \"sts:AssumeRole\",
        \"Condition\": {\"StringEquals\": {\"aws:SourceAccount\": \"${ACCOUNT_ID}\"}}
      }]
    }"
  NEW_ROLE=true
  echo "created"
else
  echo "already there"
fi
aws iam put-role-policy --role-name "$ROLE_NAME" --policy-name "${ROLE_NAME}-policy" --profile "$PROFILE" \
  --policy-document "{
    \"Version\": \"2012-10-17\",
    \"Statement\": [{
      \"Sid\": \"InvokeApi\",
      \"Effect\": \"Allow\",
      \"Action\": \"lambda:InvokeFunction\",
      \"Resource\": \"${API_LAMBDA_ARN}\"
    }]
  }"
if [ "$NEW_ROLE" = true ]; then
  echo "Waiting for IAM role propagation..."
  sleep 10
fi

echo "=== 2. Schedule $SCHEDULE_NAME ==="
TARGET="{\"Arn\":\"${API_LAMBDA_ARN}\",\"RoleArn\":\"arn:aws:iam::${ACCOUNT_ID}:role/${ROLE_NAME}\",\"Input\":\"{\\\"task\\\":\\\"expire-limit-overrides\\\"}\",\"RetryPolicy\":{\"MaximumRetryAttempts\":2}}"
if aws scheduler get-schedule --name "$SCHEDULE_NAME" --profile "$PROFILE" --region "$REGION" >/dev/null 2>&1; then
  ACTION=update-schedule
else
  ACTION=create-schedule
fi
aws scheduler "$ACTION" \
  --name "$SCHEDULE_NAME" \
  --description "paprcraft ${ENV} - end expired staff limit overrides daily" \
  --schedule-expression "cron(0 1 * * ? *)" \
  --schedule-expression-timezone "Asia/Singapore" \
  --flexible-time-window Mode=OFF \
  --state ENABLED \
  --target "$TARGET" \
  --profile "$PROFILE" --region "$REGION" >/dev/null
echo "$ACTION done"

aws scheduler get-schedule --name "$SCHEDULE_NAME" --profile "$PROFILE" --region "$REGION" \
  --query "{Name:Name,Schedule:ScheduleExpression,TZ:ScheduleExpressionTimezone,State:State,Target:Target.Arn,Input:Target.Input}" --output table
