#!/usr/bin/env bash
# Hosts one frontend for the given env: private S3 bucket -> CloudFront (Origin Access Control) ->
# Route 53 alias records. Sites:
#   landing   - frontend/landing at $LANDING_DOMAINS, folder $LANDING_PREFIX/. Unknown paths serve
#               index.html with a 404 status.
#   dashboard - frontend/dashboard at $DASHBOARD_DOMAINS, folder $DASHBOARD_PREFIX/. Single-page
#               app: unknown paths serve index.html with 200 so the client router handles them.
#   forms     - frontend/public-form at $FORMS_DOMAINS, folder $FORMS_PREFIX/. The page customers open
#               from a form link (/f/<token>): single-page like the dashboard, noindex on every env.
#
#   1. $SITE_BUCKET: private (all public access blocked, BucketOwnerEnforced), SSE-S3. Shared by
#      every frontend of this env, one folder each — what `yarn upload-<env>` syncs to.
#   2. Origin Access Control $SITE_OAC_NAME (shared), so only CloudFront can read the bucket.
#   3. Response headers policy paprcraft-<env>-<site>-headers: HSTS, nosniff, frame DENY, referrer
#      policy, plus X-Robots-Tag: noindex on stg (every site) and on the prod dashboard and forms.
#   4. The distribution (found by Comment): origin path /<folder>, us-east-1 wildcard cert from
#      05-acm-cert.sh, HTTPS redirect, managed CachingOptimized, HTTP/2+3, IPv6, PriceClass_200
#      (includes Asia edges). Missing keys come back from S3 as 403 (CloudFront has no ListBucket),
#      so 403 and 404 both map to index.html.
#   5. Bucket policy statement (one Sid per site) granting s3:GetObject on <folder>/* to that
#      distribution only. Merged into the existing policy by Sid, so sites don't clobber each other.
#   6. A + AAAA alias records for each of the site's domains.
#
# Needs the us-east-1 cert ISSUED first (05-acm-cert.sh). A new distribution takes ~5-10 minutes
# to deploy; this script waits for it. Prints the distribution id for the frontend's
# package.json invalidate-<env> script.
#
# Safe to re-run: every step checks what exists; on an existing distribution the fields below are
# laid over its current config (update-distribution), everything else kept as is.
set -euo pipefail

ENV="${1:?Usage: $0 <stg|prod> <landing|dashboard|forms>}"
SITE="${2:?Usage: $0 <stg|prod> <landing|dashboard|forms>}"
source "$(dirname "$0")/_env.sh" "$ENV"
set -f # $DOMAINS may hold a literal "*" that must not glob
CERT_DOMAIN="$BASE_DOMAIN"

case "$SITE" in
  landing)
    DOMAINS="$LANDING_DOMAINS"; PREFIX="$LANDING_PREFIX"; DIST_COMMENT="$LANDING_DIST_COMMENT"
    FALLBACK_STATUS="404"; POLICY_SID="LandingCloudFrontRead"
    NOINDEX=$([ "$ENV" = "stg" ] && echo true || echo false)
    ;;
  dashboard)
    DOMAINS="$DASHBOARD_DOMAINS"; PREFIX="$DASHBOARD_PREFIX"; DIST_COMMENT="$DASHBOARD_DIST_COMMENT"
    FALLBACK_STATUS="200"; POLICY_SID="DashboardCloudFrontRead"
    NOINDEX=true # a signed-in app has nothing for search engines on any env
    ;;
  forms)
    DOMAINS="$FORMS_DOMAINS"; PREFIX="$FORMS_PREFIX"; DIST_COMMENT="$FORMS_DIST_COMMENT"
    FALLBACK_STATUS="200"; POLICY_SID="FormsCloudFrontRead"
    NOINDEX=true # links are private; nothing here is for search engines on any env
    ;;
  *)
    echo "Unknown site '$SITE' — expected 'landing', 'dashboard' or 'forms'" >&2
    exit 1
    ;;
esac

CACHING_OPTIMIZED_ID="658327ea-f89d-4fab-a63d-7e88639e58f6" # AWS managed cache policy
CLOUDFRONT_ZONE_ID="Z2FDTNDATAQYW2"                        # fixed hosted zone id for CloudFront aliases
HEADERS_POLICY_NAME="paprcraft-${ENV}-${SITE}-headers"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

ZONE_ID=$(aws route53 list-hosted-zones-by-name --dns-name "$HOSTED_ZONE_NAME" --max-items 1 \
  --profile "$PROFILE" --query "HostedZones[?Name=='${HOSTED_ZONE_NAME}.'].Id | [0]" --output text)
ZONE_ID="${ZONE_ID#/hostedzone/}"
[ "$ZONE_ID" != "None" ] || { echo "No hosted zone for $HOSTED_ZONE_NAME" >&2; exit 1; }

CERT_ARN=$(aws acm list-certificates --region us-east-1 --profile "$PROFILE" --certificate-statuses ISSUED \
  --query "CertificateSummaryList[?DomainName=='${CERT_DOMAIN}'].CertificateArn | [0]" --output text)
if [ -z "$CERT_ARN" ] || [ "$CERT_ARN" = "None" ]; then
  echo "No ISSUED $CERT_DOMAIN cert in us-east-1. Run 05-acm-cert.sh first." >&2
  exit 1
fi

# --- 1. Bucket -------------------------------------------------------------------------------
if aws s3api head-bucket --bucket "$SITE_BUCKET" --profile "$PROFILE" --region "$REGION" >/dev/null 2>&1; then
  echo "Bucket $SITE_BUCKET exists."
else
  echo "Creating bucket $SITE_BUCKET in $REGION..."
  aws s3api create-bucket --bucket "$SITE_BUCKET" --region "$REGION" \
    --create-bucket-configuration LocationConstraint="$REGION" --profile "$PROFILE" >/dev/null
fi
aws s3api put-public-access-block --bucket "$SITE_BUCKET" --profile "$PROFILE" --region "$REGION" \
  --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
aws s3api put-bucket-ownership-controls --bucket "$SITE_BUCKET" --profile "$PROFILE" --region "$REGION" \
  --ownership-controls 'Rules=[{ObjectOwnership=BucketOwnerEnforced}]'
aws s3api put-bucket-encryption --bucket "$SITE_BUCKET" --profile "$PROFILE" --region "$REGION" \
  --server-side-encryption-configuration '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}'

# --- 2. Origin Access Control ---------------------------------------------------------------
OAC_ID=$(aws cloudfront list-origin-access-controls --profile "$PROFILE" \
  --query "OriginAccessControlList.Items[?Name=='${SITE_OAC_NAME}'].Id | [0]" --output text)
if [ -z "$OAC_ID" ] || [ "$OAC_ID" = "None" ]; then
  echo "Creating origin access control $SITE_OAC_NAME..."
  OAC_ID=$(aws cloudfront create-origin-access-control --profile "$PROFILE" \
    --origin-access-control-config "Name=${SITE_OAC_NAME},Description=paprcraft ${ENV} site bucket access,SigningProtocol=sigv4,SigningBehavior=always,OriginAccessControlOriginType=s3" \
    --query OriginAccessControl.Id --output text)
fi
echo "Origin access control: $OAC_ID"

# --- 3. Response headers policy -------------------------------------------------------------
CUSTOM_HEADERS='{"Quantity":0,"Items":[]}'
if [ "$NOINDEX" = true ]; then
  CUSTOM_HEADERS='{"Quantity":1,"Items":[{"Header":"X-Robots-Tag","Value":"noindex, nofollow","Override":true}]}'
fi
cat > "$TMP/headers.json" <<JSON
{
  "Name": "${HEADERS_POLICY_NAME}",
  "Comment": "paprcraft ${ENV} ${SITE} security headers",
  "SecurityHeadersConfig": {
    "StrictTransportSecurity": {"Override": true, "AccessControlMaxAgeSec": 31536000, "IncludeSubdomains": false, "Preload": false},
    "ContentTypeOptions": {"Override": true},
    "FrameOptions": {"Override": true, "FrameOption": "DENY"},
    "ReferrerPolicy": {"Override": true, "ReferrerPolicy": "strict-origin-when-cross-origin"}
  },
  "CustomHeadersConfig": ${CUSTOM_HEADERS}
}
JSON
HEADERS_ID=$(aws cloudfront list-response-headers-policies --type custom --profile "$PROFILE" \
  --query "ResponseHeadersPolicyList.Items[?ResponseHeadersPolicy.ResponseHeadersPolicyConfig.Name=='${HEADERS_POLICY_NAME}'].ResponseHeadersPolicy.Id | [0]" --output text)
if [ -z "$HEADERS_ID" ] || [ "$HEADERS_ID" = "None" ]; then
  echo "Creating response headers policy $HEADERS_POLICY_NAME..."
  HEADERS_ID=$(aws cloudfront create-response-headers-policy --profile "$PROFILE" \
    --response-headers-policy-config "file://$TMP/headers.json" --query ResponseHeadersPolicy.Id --output text)
else
  echo "Updating response headers policy $HEADERS_POLICY_NAME..."
  ETAG=$(aws cloudfront get-response-headers-policy --id "$HEADERS_ID" --profile "$PROFILE" --query ETag --output text)
  aws cloudfront update-response-headers-policy --id "$HEADERS_ID" --if-match "$ETAG" --profile "$PROFILE" \
    --response-headers-policy-config "file://$TMP/headers.json" >/dev/null
fi

# --- 3b. Extra origins/behaviours ------------------------------------------------------------
# None by default. (The reference project routed a wildcard status-page site through a CloudFront
# Function to its API here; add your own origins and cache behaviours in these three variables.)
EXTRA_ORIGINS=""
ORIGIN_COUNT=1
CACHE_BEHAVIORS='{"Quantity":0}'

# --- 4. Distribution ------------------------------------------------------------------------
ALIASES_JSON=$(printf '"%s",' $DOMAINS); ALIASES_JSON="[${ALIASES_JSON%,}]"
ALIAS_COUNT=$(echo $DOMAINS | wc -w | tr -d ' ')

write_dist_config() { # $1 = CallerReference
  cat > "$TMP/dist.json" <<JSON
{
  "CallerReference": "$1",
  "Comment": "${DIST_COMMENT}",
  "Enabled": true,
  "Aliases": {"Quantity": ${ALIAS_COUNT}, "Items": ${ALIASES_JSON}},
  "DefaultRootObject": "index.html",
  "Origins": {"Quantity": ${ORIGIN_COUNT}, "Items": [{
    "Id": "site-bucket",
    "DomainName": "${SITE_BUCKET}.s3.${REGION}.amazonaws.com",
    "OriginPath": "/${PREFIX}",
    "OriginAccessControlId": "${OAC_ID}",
    "S3OriginConfig": {"OriginAccessIdentity": ""}
  }${EXTRA_ORIGINS}]},
  "CacheBehaviors": ${CACHE_BEHAVIORS},
  "DefaultCacheBehavior": {
    "TargetOriginId": "site-bucket",
    "ViewerProtocolPolicy": "redirect-to-https",
    "CachePolicyId": "${CACHING_OPTIMIZED_ID}",
    "ResponseHeadersPolicyId": "${HEADERS_ID}",
    "Compress": true,
    "AllowedMethods": {"Quantity": 2, "Items": ["GET", "HEAD"], "CachedMethods": {"Quantity": 2, "Items": ["GET", "HEAD"]}}
  },
  "CustomErrorResponses": {"Quantity": 2, "Items": [
    {"ErrorCode": 403, "ResponsePagePath": "/index.html", "ResponseCode": "${FALLBACK_STATUS}", "ErrorCachingMinTTL": 60},
    {"ErrorCode": 404, "ResponsePagePath": "/index.html", "ResponseCode": "${FALLBACK_STATUS}", "ErrorCachingMinTTL": 60}
  ]},
  "ViewerCertificate": {"ACMCertificateArn": "${CERT_ARN}", "SSLSupportMethod": "sni-only", "MinimumProtocolVersion": "TLSv1.2_2021"},
  "PriceClass": "PriceClass_200",
  "HttpVersion": "http2and3",
  "IsIPV6Enabled": true
}
JSON
}

DIST_ID=$(aws cloudfront list-distributions --profile "$PROFILE" \
  --query "DistributionList.Items[?Comment=='${DIST_COMMENT}'].Id | [0]" --output text)
if [ -z "$DIST_ID" ] || [ "$DIST_ID" = "None" ]; then
  echo "Creating distribution $DIST_COMMENT for $DOMAINS..."
  write_dist_config "${DIST_COMMENT}-$(date +%s)"
  DIST_ID=$(aws cloudfront create-distribution --profile "$PROFILE" \
    --distribution-config "file://$TMP/dist.json" --query Distribution.Id --output text)
else
  echo "Updating distribution $DIST_ID..."
  # UpdateDistribution needs the WHOLE config (Logging, Restrictions, ... included), so the fields
  # managed here are laid over the distribution's current config rather than sent alone.
  aws cloudfront get-distribution-config --id "$DIST_ID" --profile "$PROFILE" --output json > "$TMP/current.json"
  ETAG=$(python3 -I -c 'import json,sys; print(json.load(open(sys.argv[1]))["ETag"])' "$TMP/current.json")
  write_dist_config "unused"
  python3 -I - "$TMP/current.json" "$TMP/dist.json" > "$TMP/merged.json" <<'PY'
import json, sys
def merge(cur, new):
    # Dicts merge key by key; lists of dicts with an Id (Origins.Items) merge by Id; other
    # equal-length lists of dicts (CustomErrorResponses.Items) merge item by item; anything else
    # takes the new value.
    if isinstance(cur, dict) and isinstance(new, dict):
        return {**cur, **{k: merge(cur.get(k), v) for k, v in new.items()}}
    if isinstance(cur, list) and isinstance(new, list) and all(isinstance(x, dict) and "Id" in x for x in cur + new):
        by_id = {c["Id"]: c for c in cur}
        return [merge(by_id.get(n["Id"]), n) for n in new]
    if isinstance(cur, list) and isinstance(new, list) and len(cur) == len(new) and all(isinstance(x, dict) for x in cur + new):
        return [merge(c, n) for c, n in zip(cur, new)]
    return new

current = json.load(open(sys.argv[1]))["DistributionConfig"]
ours = json.load(open(sys.argv[2]))
ours.pop("CallerReference")
print(json.dumps(merge(current, ours)))
PY
  aws cloudfront update-distribution --id "$DIST_ID" --if-match "$ETAG" --profile "$PROFILE" \
    --distribution-config "file://$TMP/merged.json" >/dev/null
fi
DIST_DOMAIN=$(aws cloudfront get-distribution --id "$DIST_ID" --profile "$PROFILE" --query Distribution.DomainName --output text)
DIST_ARN="arn:aws:cloudfront::${ACCOUNT_ID}:distribution/${DIST_ID}"

# --- 5. Bucket policy (merged by Sid) -------------------------------------------------------
EXISTING=$(aws s3api get-bucket-policy --bucket "$SITE_BUCKET" --profile "$PROFILE" --region "$REGION" \
  --query Policy --output text 2>/dev/null || echo '{"Version":"2012-10-17","Statement":[]}')
python3 -I - "$EXISTING" "$POLICY_SID" "$SITE_BUCKET" "$PREFIX" "$DIST_ARN" > "$TMP/policy.json" <<'PY'
import json, sys
policy, sid, bucket, prefix, dist_arn = json.loads(sys.argv[1]), *sys.argv[2:]
policy["Statement"] = [s for s in policy.get("Statement", []) if s.get("Sid") != sid] + [{
    "Sid": sid,
    "Effect": "Allow",
    "Principal": {"Service": "cloudfront.amazonaws.com"},
    "Action": "s3:GetObject",
    "Resource": f"arn:aws:s3:::{bucket}/{prefix}/*",
    "Condition": {"StringEquals": {"AWS:SourceArn": dist_arn}},
}]
print(json.dumps(policy))
PY
echo "Applying bucket policy (CloudFront read on ${PREFIX}/*)..."
aws s3api put-bucket-policy --bucket "$SITE_BUCKET" --policy "file://$TMP/policy.json" \
  --profile "$PROFILE" --region "$REGION"

# --- 6. DNS ---------------------------------------------------------------------------------
for domain in $DOMAINS; do
  echo "UPSERTing A/AAAA alias $domain -> $DIST_DOMAIN..."
  aws route53 change-resource-record-sets --hosted-zone-id "$ZONE_ID" --profile "$PROFILE" \
    --change-batch "{\"Changes\":[
      {\"Action\":\"UPSERT\",\"ResourceRecordSet\":{\"Name\":\"$domain\",\"Type\":\"A\",
        \"AliasTarget\":{\"HostedZoneId\":\"$CLOUDFRONT_ZONE_ID\",\"DNSName\":\"$DIST_DOMAIN\",\"EvaluateTargetHealth\":false}}},
      {\"Action\":\"UPSERT\",\"ResourceRecordSet\":{\"Name\":\"$domain\",\"Type\":\"AAAA\",
        \"AliasTarget\":{\"HostedZoneId\":\"$CLOUDFRONT_ZONE_ID\",\"DNSName\":\"$DIST_DOMAIN\",\"EvaluateTargetHealth\":false}}}
    ]}" >/dev/null
done

echo "Waiting for distribution $DIST_ID to finish deploying (~5-10 minutes)..."
aws cloudfront wait distribution-deployed --id "$DIST_ID" --profile "$PROFILE"

echo "Done."
case "$SITE" in forms) PKG_DIR="public-form" ;; *) PKG_DIR="$SITE" ;; esac
echo "  Distribution id: $DIST_ID  (set in frontend/${PKG_DIR}/package.json invalidate-${ENV})"
echo "  CloudFront domain: $DIST_DOMAIN"
echo "  Site: https://${DOMAINS%% *}"
