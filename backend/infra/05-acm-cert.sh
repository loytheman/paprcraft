#!/usr/bin/env bash
# Requests the wildcard certs. No env arg — not env-specific, the certs cover every env.
# Two for paprcraft.com + *.paprcraft.com, one per AWS requirement:
#   - us-east-1: for CloudFront (the frontend distributions, 21-site-hosting.sh), which only
#     accepts certs from that region.
#   - ap-southeast-1 (REGIONAL): for API Gateway's custom domains (07-api-custom-domain.sh) —
#     apigatewayv2 rejects EDGE-optimized custom domains outright, so a REGIONAL domain needs a
#     cert in the API's own region.
#
# Validation is fully automatic: paprcraft.com's hosted zone is in this account, so the DNS
# validation CNAME is UPSERTed into Route 53 here (both certs get the same record — ACM derives it
# from the domain name and account) and the script waits until both show ISSUED.
#
# Safe to re-run: an existing ISSUED/PENDING_VALIDATION cert for paprcraft.com in a region is
# reused instead of requesting another.
set -euo pipefail

# Only env-independent values (PROFILE, REGION, HOSTED_ZONE_NAME) are used from _env.sh.
source "$(dirname "$0")/_env.sh" stg
DOMAIN="$BASE_DOMAIN"

ZONE_ID=$(aws route53 list-hosted-zones-by-name --dns-name "$HOSTED_ZONE_NAME" --max-items 1 \
  --profile "$PROFILE" --query "HostedZones[?Name=='${HOSTED_ZONE_NAME}.'].Id | [0]" --output text)
ZONE_ID="${ZONE_ID#/hostedzone/}"
[ "$ZONE_ID" != "None" ] || { echo "No hosted zone for $HOSTED_ZONE_NAME" >&2; exit 1; }

# Prints the cert ARN for $1 (region), requesting one first if none exists. Progress goes to stderr.
ensure_cert() {
  local region=$1 arn
  arn=$(aws acm list-certificates --region "$region" --profile "$PROFILE" \
    --certificate-statuses ISSUED PENDING_VALIDATION \
    --query "CertificateSummaryList[?DomainName=='${DOMAIN}'].CertificateArn | [0]" --output text)
  if [ -z "$arn" ] || [ "$arn" = "None" ]; then
    echo "Requesting ACM certificate for $DOMAIN + *.$DOMAIN in $region..." >&2
    arn=$(aws acm request-certificate \
      --domain-name "$DOMAIN" \
      --subject-alternative-names "*.${DOMAIN}" \
      --validation-method DNS \
      --idempotency-token "paprcraft${region//-/}" \
      --region "$region" --profile "$PROFILE" \
      --query CertificateArn --output text)
  else
    echo "Reusing existing certificate in $region." >&2
  fi
  echo "$arn"
}

# UPSERTs the validation CNAME for the cert $2 in region $1 (waits for ACM to generate it first).
add_validation_record() {
  local region=$1 arn=$2 name="None" value i
  for i in $(seq 1 12); do
    read -r name value < <(aws acm describe-certificate --certificate-arn "$arn" \
      --region "$region" --profile "$PROFILE" \
      --query "Certificate.DomainValidationOptions[0].ResourceRecord.[Name,Value]" --output text)
    [ "$name" != "None" ] && [ -n "$name" ] && break
    sleep 5
  done
  [ "$name" != "None" ] && [ -n "$name" ] || { echo "ACM never produced a validation record for $arn" >&2; exit 1; }

  echo "UPSERTing validation record $name..."
  aws route53 change-resource-record-sets --hosted-zone-id "$ZONE_ID" --profile "$PROFILE" \
    --change-batch "{\"Changes\":[{\"Action\":\"UPSERT\",\"ResourceRecordSet\":{
      \"Name\":\"$name\",\"Type\":\"CNAME\",\"TTL\":300,
      \"ResourceRecords\":[{\"Value\":\"$value\"}]}}]}" >/dev/null
}

CF_CERT_ARN=$(ensure_cert us-east-1)
API_CERT_ARN=$(ensure_cert "$REGION")
add_validation_record us-east-1 "$CF_CERT_ARN"
add_validation_record "$REGION" "$API_CERT_ARN"

echo "Waiting for the certificates to be ISSUED (usually 1-5 minutes)..."
aws acm wait certificate-validated --certificate-arn "$CF_CERT_ARN" --region us-east-1 --profile "$PROFILE"
aws acm wait certificate-validated --certificate-arn "$API_CERT_ARN" --region "$REGION" --profile "$PROFILE"

echo "Done."
echo "  CloudFront (us-east-1):    $CF_CERT_ARN"
echo "  API Gateway ($REGION): $API_CERT_ARN"
