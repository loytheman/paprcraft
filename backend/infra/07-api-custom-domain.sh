#!/usr/bin/env bash
# Attaches the custom domain (api-stg.paprcraft.com / api.paprcraft.com) to the HTTP API created
# by 06-api-gateway.sh, using the shared REGIONAL wildcard cert from 05-acm-cert.sh (must be
# ISSUED first, one cert covers both envs).
#
# The existing *.paprcraft.com wildcard cert in us-east-1 can NOT be reused here even though it
# covers these subdomains too: apigatewayv2 rejects EndpointType=EDGE outright ("EDGE endpoint
# type is not supported for APIGatewayV2 domainName") — HTTP API custom domains only support
# REGIONAL, which requires the cert to be issued in this same region (ap-southeast-1). Hence
# the second, region-specific wildcard cert from 05-acm-cert.sh.
# Run in this order: 05 (once, waits for ISSUED), 06, then this one per env. The A alias record
# is written to the paprcraft.com hosted zone here. Safe to re-run.
set -euo pipefail

ENV="${1:?Usage: $0 <stg|prod>}"
source "$(dirname "$0")/_env.sh" "$ENV"

echo "Looking up the ISSUED paprcraft.com wildcard cert in $REGION..."
CERT_ARN=$(aws acm list-certificates \
  --certificate-statuses ISSUED \
  --profile "$PROFILE" --region "$REGION" \
  --query "CertificateSummaryList[?DomainName=='${BASE_DOMAIN}'].CertificateArn | [0]" --output text)
if [ -z "$CERT_ARN" ] || [ "$CERT_ARN" = "None" ]; then
  echo "No ISSUED $BASE_DOMAIN cert found in $REGION. Run 05-acm-cert.sh and validate DNS first." >&2
  exit 1
fi
echo "Certificate: $CERT_ARN"

echo "Looking up HTTP API id for $API_NAME..."
API_ID=$(aws apigatewayv2 get-apis \
  --profile "$PROFILE" --region "$REGION" \
  --query "Items[?Name=='${API_NAME}'].ApiId | [0]" --output text)
if [ -z "$API_ID" ] || [ "$API_ID" = "None" ]; then
  echo "No HTTP API named $API_NAME found. Run 06-api-gateway.sh $ENV first." >&2
  exit 1
fi
echo "API ID: $API_ID"

echo "Creating custom domain $API_DOMAIN (REGIONAL)..."
aws apigatewayv2 create-domain-name \
  --domain-name "$API_DOMAIN" \
  --domain-name-configurations CertificateArn="$CERT_ARN",EndpointType=REGIONAL \
  --profile "$PROFILE" --region "$REGION" \
  || echo "(domain name may already exist — safe to ignore if so)"

echo "Mapping $API_DOMAIN -> API $API_ID (\$default stage)..."
aws apigatewayv2 create-api-mapping \
  --domain-name "$API_DOMAIN" \
  --api-id "$API_ID" \
  --stage '$default' \
  --profile "$PROFILE" --region "$REGION" \
  || echo "(mapping may already exist — safe to ignore if so)"

read -r TARGET TARGET_ZONE < <(aws apigatewayv2 get-domain-name \
  --domain-name "$API_DOMAIN" \
  --profile "$PROFILE" --region "$REGION" \
  --query "DomainNameConfigurations[0].[ApiGatewayDomainName,HostedZoneId]" --output text)

ZONE_ID=$(aws route53 list-hosted-zones-by-name --dns-name "$HOSTED_ZONE_NAME" --max-items 1 \
  --profile "$PROFILE" --query "HostedZones[?Name=='${HOSTED_ZONE_NAME}.'].Id | [0]" --output text)
ZONE_ID="${ZONE_ID#/hostedzone/}"

echo "UPSERTing A alias $API_DOMAIN -> $TARGET in Route 53..."
aws route53 change-resource-record-sets --hosted-zone-id "$ZONE_ID" --profile "$PROFILE" \
  --change-batch "{\"Changes\":[{\"Action\":\"UPSERT\",\"ResourceRecordSet\":{\"Name\":\"$API_DOMAIN\",\"Type\":\"A\",
    \"AliasTarget\":{\"HostedZoneId\":\"$TARGET_ZONE\",\"DNSName\":\"$TARGET\",\"EvaluateTargetHealth\":false}}}]}" >/dev/null
echo "Done: https://$API_DOMAIN"
