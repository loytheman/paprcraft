#!/usr/bin/env bash
# Builds and publishes the shared "paprcraft-api-deps" Lambda layer: backend/api's production
# dependencies (npm install --omit=dev), reused by both paprcraft-stg-api and paprcraft-prod-api
# since they run the same code from the same package.json. No env arg — not env-specific.
# Re-run whenever backend/api/package.json's dependencies change; 10-api-lambda-function.sh
# always picks up the latest published version automatically.
set -euo pipefail

PROFILE="paprcraft-dev-loy"
REGION="ap-southeast-1"
API_DIR="$(cd "$(dirname "$0")/../api" && pwd)"
LAYER_DIR="$(dirname "$API_DIR")/_layer"

echo "Installing production dependencies from backend/api/package.json..."
rm -rf "$LAYER_DIR"
mkdir -p "$LAYER_DIR/nodejs"
cp "$API_DIR/package.json" "$LAYER_DIR/nodejs/package.json"
( cd "$LAYER_DIR/nodejs" && npm install --omit=dev )

echo "Zipping layer..."
( cd "$LAYER_DIR" && zip -rq layer.zip nodejs -x "*.DS_Store" )
ls -lh "$LAYER_DIR/layer.zip"

echo "Publishing layer version..."
aws lambda publish-layer-version \
  --layer-name "paprcraft-api-deps" \
  --description "Production node_modules for paprcraft-api (from backend/api/package.json)" \
  --zip-file "fileb://$LAYER_DIR/layer.zip" \
  --compatible-runtimes nodejs20.x nodejs22.x nodejs24.x \
  --compatible-architectures x86_64 \
  --profile "$PROFILE" --region "$REGION" \
  --query "[LayerVersionArn,Version]" --output text
