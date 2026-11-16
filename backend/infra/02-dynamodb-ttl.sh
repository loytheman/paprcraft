#!/usr/bin/env bash
# Enables DynamoDB TTL on the "ttl" attribute of the main table. Safe/idempotent: AWS rejects
# re-enabling an attribute that's already active, which this script treats as success.
# Items that set "ttl" expire on their own: tokens and rate-limit counters (and whatever you add).
# Others are kept.
set -euo pipefail

ENV="${1:?Usage: $0 <stg|prod>}"
source "$(dirname "$0")/_env.sh" "$ENV"

echo "Current TTL status:"
aws dynamodb describe-time-to-live --table-name "$TABLE" --profile "$PROFILE" --region "$REGION"

set +e
aws dynamodb update-time-to-live \
  --table-name "$TABLE" \
  --time-to-live-specification "Enabled=true,AttributeName=ttl" \
  --profile "$PROFILE" --region "$REGION"
status=$?
set -e

if [ $status -ne 0 ]; then
  echo "update-time-to-live failed or already enabled — check the status above."
fi
