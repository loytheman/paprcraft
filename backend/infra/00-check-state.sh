#!/usr/bin/env bash
# Read-only. Prints what's already provisioned in AWS for the given paprcraft environment so we
# stop guessing from committed evidence (bucket policies, .env files) and see the real gap.
# Run this before writing/running any of the other infra/*.sh scripts.
set -euo pipefail

ENV="${1:?Usage: $0 <stg|prod>}"
source "$(dirname "$0")/_env.sh" "$ENV"

hr() { printf '\n=== %s ===\n' "$1"; }

hr "Caller identity"
aws sts get-caller-identity --profile "$PROFILE"

hr "DynamoDB tables (paprcraft-*)"
aws dynamodb list-tables --profile "$PROFILE" --region "$REGION" \
  --query "TableNames[?contains(@, 'paprcraft')]"

hr "DynamoDB TTL on $TABLE"
aws dynamodb describe-time-to-live --table-name "$TABLE" --profile "$PROFILE" --region "$REGION" 2>&1 || true


hr "Lambda functions (paprcraft)"
aws lambda list-functions --profile "$PROFILE" --region "$REGION" \
  --query "Functions[?contains(FunctionName, 'paprcraft')].[FunctionName,Runtime,LastModified]" \
  --output table

hr "SES verified identities"
aws sesv2 list-email-identities --profile "$PROFILE" --region "$REGION" \
  --query "EmailIdentities[].[IdentityName,IdentityType,VerificationStatus,SendingEnabled]" \
  --output table


hr "API Gateway HTTP APIs (paprcraft)"
aws apigatewayv2 get-apis --profile "$PROFILE" --region "$REGION" \
  --query "Items[?contains(Name, 'paprcraft')].[ApiId,Name,ApiEndpoint]" --output table

hr "API Gateway custom domain: $API_DOMAIN"
aws apigatewayv2 get-domain-name --domain-name "$API_DOMAIN" --profile "$PROFILE" --region "$REGION" 2>&1 || echo "not found"

hr "Shared $BASE_DOMAIN wildcard cert (regional, $REGION — covers both api-stg/api custom domains)"
aws acm list-certificates --profile "$PROFILE" --region "$REGION" \
  --query "CertificateSummaryList[?DomainName=='${BASE_DOMAIN}'].[CertificateArn,Status]" --output table

hr "CloudFront $BASE_DOMAIN wildcard cert (us-east-1 — frontend distributions)"
aws acm list-certificates --profile "$PROFILE" --region us-east-1 \
  --query "CertificateSummaryList[?DomainName=='${BASE_DOMAIN}'].[CertificateArn,Status]" --output table

hr "Site bucket: $SITE_BUCKET"
aws s3api head-bucket --bucket "$SITE_BUCKET" --profile "$PROFILE" --region "$REGION" 2>&1 || echo "not found"

hr "CloudFront distributions"
aws cloudfront list-distributions --profile "$PROFILE" \
  --query "DistributionList.Items[].[Id,Comment,Status,DomainName,join(' ', Aliases.Items || \`[]\`)]" --output table

hr "Route 53 records in $HOSTED_ZONE_NAME"
zone_id=$(aws route53 list-hosted-zones-by-name --dns-name "$HOSTED_ZONE_NAME" --max-items 1 --profile "$PROFILE" \
  --query "HostedZones[?Name=='${HOSTED_ZONE_NAME}.'].Id | [0]" --output text)
aws route53 list-resource-record-sets --hosted-zone-id "${zone_id#/hostedzone/}" --profile "$PROFILE" \
  --query "ResourceRecordSets[].[Name,Type]" --output table
