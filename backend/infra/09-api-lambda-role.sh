#!/usr/bin/env bash
# Creates the execution role for the API lambda (backend/api), scoped to what
# backend/api/src actually calls:
#   - DynamoDB: the two tables for this env + their GSIs (services/index.js, dynamodb-onetable)
#   - SES: SendEmail (service.email.js: team invites, closure)
#   - Lambda: InvokeFunction on the PDF converter $PDF_LAMBDA_NAME (service.converter.js; 30-pdf-convert.sh)
#   - Lambda: InvokeFunction on the docx template renderer $DOCX_LAMBDA_NAME (service.template.js generate; 29-docx-template.sh)
#   - S3: uploaded images in $STORAGE_BUCKET (service.attachment.js): sign uploads, check and copy
#     them out of tmp/, sign view links, delete (28-attachments.sh)
# Safe to re-run: create-role/attach-role-policy tolerate "already exists", and put-role-policy
# always replaces the inline policy wholesale.
set -euo pipefail

ENV="${1:?Usage: $0 <stg|prod>}"
source "$(dirname "$0")/_env.sh" "$ENV"

TRUST_POLICY='{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": {"Service": "lambda.amazonaws.com"},
    "Action": "sts:AssumeRole"
  }]
}'

echo "Creating role $API_IAM_ROLE_NAME..."
aws iam create-role \
  --role-name "$API_IAM_ROLE_NAME" \
  --assume-role-policy-document "$TRUST_POLICY" \
  --profile "$PROFILE" \
  || echo "(role may already exist — safe to ignore if so)"

echo "Attaching AWSLambdaBasicExecutionRole..."
aws iam attach-role-policy \
  --role-name "$API_IAM_ROLE_NAME" \
  --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole \
  --profile "$PROFILE" \
  || echo "(already attached — safe to ignore if so)"

echo "Attaching inline policy (DynamoDB on $TABLE/$AUDIT_TABLE, SES send, docx Lambda invoke, S3 on $STORAGE_BUCKET)..."
INLINE_POLICY=$(cat <<JSON
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DynamoDbTables",
      "Effect": "Allow",
      "Action": [
        "dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:UpdateItem", "dynamodb:DeleteItem",
        "dynamodb:Query", "dynamodb:Scan", "dynamodb:BatchGetItem", "dynamodb:BatchWriteItem"
      ],
      "Resource": [
        "arn:aws:dynamodb:${REGION}:${ACCOUNT_ID}:table/${TABLE}",
        "arn:aws:dynamodb:${REGION}:${ACCOUNT_ID}:table/${TABLE}/index/*",
        "arn:aws:dynamodb:${REGION}:${ACCOUNT_ID}:table/${AUDIT_TABLE}",
        "arn:aws:dynamodb:${REGION}:${ACCOUNT_ID}:table/${AUDIT_TABLE}/index/*"
      ]
    },
    {
      "Sid": "SesSend",
      "Effect": "Allow",
      "Action": "ses:SendEmail",
      "Resource": "*"
    },
    {
      "Sid": "InvokeDocxTemplateRenderer",
      "Effect": "Allow",
      "Action": "lambda:InvokeFunction",
      "Resource": "arn:aws:lambda:${REGION}:${ACCOUNT_ID}:function:${DOCX_LAMBDA_NAME}"
    },
    {
      "Sid": "InvokePdfConverter",
      "Effect": "Allow",
      "Action": "lambda:InvokeFunction",
      "Resource": "arn:aws:lambda:${REGION}:${ACCOUNT_ID}:function:${PDF_LAMBDA_NAME}"
    },
    {
      "Sid": "UploadedImages",
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"],
      "Resource": "arn:aws:s3:::${STORAGE_BUCKET}/*"
    },
    {
      "Sid": "UploadedImagesList",
      "Effect": "Allow",
      "Action": "s3:ListBucket",
      "Resource": "arn:aws:s3:::${STORAGE_BUCKET}"
    }
  ]
}
JSON
)
aws iam put-role-policy \
  --role-name "$API_IAM_ROLE_NAME" \
  --policy-name "${API_IAM_ROLE_NAME}-policy" \
  --policy-document "$INLINE_POLICY" \
  --profile "$PROFILE"

echo "Waiting for IAM role propagation..."
sleep 10
aws iam get-role --role-name "$API_IAM_ROLE_NAME" --profile "$PROFILE" --query "Role.Arn" --output text
