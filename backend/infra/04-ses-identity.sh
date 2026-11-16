#!/usr/bin/env bash
# Sets up $SES_DOMAIN as the env's sending domain, with the DNS that gets mail delivered to inboxes.
# paprcraft.com's hosted zone is in this account, so every record is written to Route 53 here.
#   1. SES domain identity with DKIM (Easy DKIM, 2048-bit) + its three CNAME records. The DKIM
#      records are also what verifies the domain.
#   2. Custom MAIL FROM mail.$SES_DOMAIN + its MX and SPF records, so SPF aligns with the From
#      domain instead of passing for amazonses.com only.
#   3. DMARC at _dmarc.$SES_DOMAIN, monitoring only (p=none). Written only if there's no record
#      yet, so a policy tightened by hand later isn't reset.
# Waits until the identity verifies (usually a few minutes). Safe to re-run.
set -euo pipefail

ENV="${1:?Usage: $0 <stg|prod>}"
source "$(dirname "$0")/_env.sh" "$ENV"
AWS=(--profile "$PROFILE" --region "$REGION")
MAIL_FROM="mail.${SES_DOMAIN}"

ZONE_ID=$(aws route53 list-hosted-zones-by-name --dns-name "$HOSTED_ZONE_NAME" --max-items 1 \
  --profile "$PROFILE" --query "HostedZones[?Name=='${HOSTED_ZONE_NAME}.'].Id | [0]" --output text)
ZONE_ID="${ZONE_ID#/hostedzone/}"
[ "$ZONE_ID" != "None" ] || { echo "No hosted zone for $HOSTED_ZONE_NAME" >&2; exit 1; }

upsert() { # $1 = name, $2 = type, $3 = JSON array of ResourceRecords
  aws route53 change-resource-record-sets --hosted-zone-id "$ZONE_ID" --profile "$PROFILE" --change-batch \
    "{\"Changes\":[{\"Action\":\"UPSERT\",\"ResourceRecordSet\":{\"Name\":\"$1\",\"Type\":\"$2\",\"TTL\":300,\"ResourceRecords\":$3}}]}" >/dev/null
  echo "  $2 $1"
}

echo "=== 1. Identity $SES_DOMAIN ==="
if aws sesv2 get-email-identity --email-identity "$SES_DOMAIN" "${AWS[@]}" >/dev/null 2>&1; then
  echo "exists"
else
  aws sesv2 create-email-identity --email-identity "$SES_DOMAIN" \
    --dkim-signing-attributes NextSigningKeyLength=RSA_2048_BIT "${AWS[@]}" >/dev/null
  echo "created"
fi
for token in $(aws sesv2 get-email-identity --email-identity "$SES_DOMAIN" --query "DkimAttributes.Tokens" --output text "${AWS[@]}"); do
  upsert "${token}._domainkey.${SES_DOMAIN}" CNAME "[{\"Value\":\"${token}.dkim.amazonses.com\"}]"
done

echo "=== 2. MAIL FROM $MAIL_FROM ==="
aws sesv2 put-email-identity-mail-from-attributes --email-identity "$SES_DOMAIN" \
  --mail-from-domain "$MAIL_FROM" --behavior-on-mx-failure USE_DEFAULT_VALUE "${AWS[@]}"
upsert "$MAIL_FROM" MX "[{\"Value\":\"10 feedback-smtp.${REGION}.amazonses.com\"}]"
upsert "$MAIL_FROM" TXT '[{"Value":"\"v=spf1 include:amazonses.com ~all\""}]'

echo "=== 3. DMARC ==="
EXISTING=$(aws route53 list-resource-record-sets --hosted-zone-id "$ZONE_ID" --profile "$PROFILE" \
  --query "ResourceRecordSets[?Name=='_dmarc.${SES_DOMAIN}.' && Type=='TXT'] | length(@)" --output text)
if [ "$EXISTING" = "0" ]; then
  upsert "_dmarc.${SES_DOMAIN}" TXT '[{"Value":"\"v=DMARC1; p=none;\""}]'
else
  echo "  already has a record, left as is"
fi

echo "=== Waiting for verification ==="
for i in $(seq 1 40); do
  STATUS=$(aws sesv2 get-email-identity --email-identity "$SES_DOMAIN" --query "[VerificationStatus,DkimAttributes.Status]" --output text "${AWS[@]}")
  echo "  $STATUS"
  case "$STATUS" in *SUCCESS*SUCCESS*) break ;; esac
  [ "$i" = 40 ] && { echo "Not verified yet. DNS can take longer; re-run later." >&2; exit 1; }
  sleep 15
done

aws sesv2 get-email-identity --email-identity "$SES_DOMAIN" "${AWS[@]}" \
  --query "{Domain:'$SES_DOMAIN',Verified:VerificationStatus,Dkim:DkimAttributes.Status,MailFrom:MailFromAttributes.MailFromDomain,MailFromStatus:MailFromAttributes.MailFromDomainStatus}" --output table
