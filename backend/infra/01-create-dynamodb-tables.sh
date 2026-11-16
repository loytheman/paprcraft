#!/usr/bin/env bash
# Creates the two DynamoDB tables the backend expects (see .env.stage / config.js):
#   - $TABLE: the single main table, gs0..gs5 — matches OneTableSchema in models/index.js exactly;
#     every model there (Account, Token, Label, ...) shares these same six GSIs.
#   - $AUDIT_TABLE: written by the audit-trail Lambda (20-audit-trail.sh), gs0..gs3 — matches
#     AuditTrailTableSchema. gs3 is created here up front; 20 still adds it to older tables.
# Pay-per-request billing (no capacity planning at ~no traffic), deletion protection on, and
# point-in-time recovery on (35 days of restorable history; costs per GB stored, cents at this size).
#
# Safe to re-run: an existing table is left as-is apart from re-asserting deletion protection and PITR.
set -euo pipefail

ENV="${1:?Usage: $0 <stg|prod>}"
source "$(dirname "$0")/_env.sh" "$ENV"

gsi_json() { # $1..$n = GSI numbers
  local out="" n
  for n in "$@"; do
    out+="{\"IndexName\":\"gs${n}\",\"KeySchema\":[{\"AttributeName\":\"gs${n}pk\",\"KeyType\":\"HASH\"},{\"AttributeName\":\"gs${n}sk\",\"KeyType\":\"RANGE\"}],\"Projection\":{\"ProjectionType\":\"ALL\"}},"
  done
  echo "[${out%,}]"
}

attrs_json() { # $1..$n = GSI numbers
  local out='{"AttributeName":"pk","AttributeType":"S"},{"AttributeName":"sk","AttributeType":"S"}' n
  for n in "$@"; do
    out+=",{\"AttributeName\":\"gs${n}pk\",\"AttributeType\":\"S\"},{\"AttributeName\":\"gs${n}sk\",\"AttributeType\":\"S\"}"
  done
  echo "[${out}]"
}

ensure_table() { # $1 = table name, rest = GSI numbers
  local table=$1; shift
  if aws dynamodb describe-table --table-name "$table" --profile "$PROFILE" --region "$REGION" >/dev/null 2>&1; then
    echo "$table exists."
  else
    echo "Creating $table (gs$(echo "$@" | sed 's/ /, gs/g'))..."
    aws dynamodb create-table \
      --table-name "$table" \
      --attribute-definitions "$(attrs_json "$@")" \
      --key-schema '[{"AttributeName":"pk","KeyType":"HASH"},{"AttributeName":"sk","KeyType":"RANGE"}]' \
      --global-secondary-indexes "$(gsi_json "$@")" \
      --billing-mode PAY_PER_REQUEST \
      --deletion-protection-enabled \
      --profile "$PROFILE" --region "$REGION" >/dev/null
    aws dynamodb wait table-exists --table-name "$table" --profile "$PROFILE" --region "$REGION"
  fi

  aws dynamodb update-table --table-name "$table" --deletion-protection-enabled \
    --profile "$PROFILE" --region "$REGION" >/dev/null 2>&1 || true
  # A brand-new table refuses this for a minute or so (ContinuousBackupsUnavailableException).
  local i
  for i in $(seq 1 20); do
    aws dynamodb update-continuous-backups --table-name "$table" \
      --point-in-time-recovery-specification PointInTimeRecoveryEnabled=true \
      --profile "$PROFILE" --region "$REGION" >/dev/null 2>&1 && break
    [ "$i" = 20 ] && { echo "Could not enable point-in-time recovery on $table" >&2; exit 1; }
    sleep 15
  done
  echo "  $table: deletion protection + point-in-time recovery on."
}

ensure_table "$TABLE" 0 1 2 3 4 5
ensure_table "$AUDIT_TABLE" 0 1 2 3
echo "Done."
