// Audit trail writer: reads the main table's DynamoDB Stream (old + new images) and writes one row
// per meaningful change into the audit-trail table. Rows are kept forever (no TTL).
//
// Who did it: the API stamps every change it makes on a person's behalf with updatedBy/createdBy
// (user, IP, device, city/country — middlewares/behaviour.js) and a fresh auditStreamId (one per
// request). A change counts as a person's only if it carries a NEW auditStreamId; anything else
// (the checker, Stripe webhooks, billing sync, scheduled sweeps) is recorded as "System" —
// otherwise the stale updatedBy left on a record by its last human edit would take the blame.
//
// Never copied into the trail: secrets (password hash, webhook secrets, codes), index/key
// attributes, and housekeeping fields. Only the record types worth auditing are passed in — the
// event source mapping filters on _type (backend/infra/20-audit-trail.sh), and this checks too.
//
// The rules (what's audited, who gets the credit) live in auditRow.js. Deployed on its own with
// auditRow.js (see backend/lambda/package.json), not with the checker's or notifier's files.
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand } = require('@aws-sdk/lib-dynamodb');
const { unmarshall } = require('@aws-sdk/util-dynamodb');

const AUDIT_TABLE = process.env.AUDIT_TABLE;
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}), { marshallOptions: { removeUndefinedValues: true } });

const { toAuditRow } = require('./auditRow');

exports.handler = async (event) => {
  const batchItemFailures = [];
  for (const record of event.Records || []) {
    try {
      const row = toAuditRow({
        eventName: record.eventName, // INSERT | MODIFY | REMOVE
        eventID: record.eventID,
        oldImg: record.dynamodb.OldImage ? unmarshall(record.dynamodb.OldImage) : null,
        newImg: record.dynamodb.NewImage ? unmarshall(record.dynamodb.NewImage) : null,
        approximateCreationDateTime: record.dynamodb.ApproximateCreationDateTime,
      });
      if (!row) continue;
      await ddb.send(new PutCommand({
        TableName: AUDIT_TABLE,
        Item: row,
        ConditionExpression: 'attribute_not_exists(pk)', // stream redelivery -> written once
      }));
    } catch (err) {
      if (err.name === 'ConditionalCheckFailedException') continue;
      console.error(`[auditTrail] ${record.eventID} failed:`, err);
      batchItemFailures.push({ itemIdentifier: record.dynamodb.SequenceNumber });
    }
  }
  return { batchItemFailures };
};
