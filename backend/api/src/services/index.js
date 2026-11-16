import pkg from "@aws-sdk/client-sts";
const { STSClient, AssumeRoleCommand } = pkg;
import { OneTableSchema, AuditTrailTableSchema } from "../models/index.js";
import { DynamoDB, DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocument } from "@aws-sdk/lib-dynamodb";
import { S3Client } from "@aws-sdk/client-s3";
import { SESClient } from "@aws-sdk/client-ses";
import { LambdaClient } from "@aws-sdk/client-lambda";
import { Table } from "dynamodb-onetable";
import { Dynamo } from "dynamodb-onetable/Dynamo";
import config from "../config/config.js";
import Utils from "../helpers/utils.js";

const configObj = {
  region: config.aws.region,
  signatureVersion: "v4",
};

let s3Client = null;
export const getS3Client = () => {
  if (s3Client) return s3Client;
  s3Client = new S3Client(configObj);
  return s3Client;
};

let sesClient = null;
export const getSesClient = () => {
  if (sesClient) return sesClient;
  sesClient = new SESClient(configObj);
  return sesClient;
};

// Invokes the docx Lambda (service.template.js generate).
let lambdaClient = null;
export const getLambdaClient = () => {
  if (lambdaClient) return lambdaClient;
  lambdaClient = new LambdaClient(configObj);
  return lambdaClient;
};

let ddbClient = null;
export const getDynamoDbClient = () => {
  if (ddbClient) return ddbClient;
  const c = new DynamoDB(configObj);
  ddbClient = DynamoDBDocument.from(c);
  return ddbClient;
};




let oneTableClient = null;
const getOneTableClient = () => {
  if (oneTableClient) return oneTableClient;
  oneTableClient = new Dynamo({ client: getDynamoDbClient() });
  return oneTableClient;
};

let oneTable = null;
export const getOneTable = () => {
  if (oneTable) return oneTable;
  oneTable = new Table({
    client: getOneTableClient(),
    name: config.db.table,
    strict: true,
    partial: true,
    schema: OneTableSchema,
    hidden: true,
    logger: (level, result, context) => {
      if (level == "trace" || level == "data") return;
      if (context?.err?.name === "ConditionalCheckFailedException") return;
      console.log(`${new Date().toLocaleString()}: ${level}: ${result}`);
      console.log(JSON.stringify(context, null, 4) + "\n");
    },
    transform: (model, operation, item) => {
      return item;
    },
  });
  // oneTable.createTable();
  return oneTable;
};

let oneTableAuditTrail = null;
export const getOneTable2 = () => {
  if (oneTableAuditTrail) return oneTableAuditTrail;
  oneTableAuditTrail = new Table({
    client: getOneTableClient(),
    name: config.db.auditTrail,
    strict: true,
    partial: true,
    schema: AuditTrailTableSchema,
    hidden: true,
    logger: (level, result, context) => {
      if (level == "trace" || level == "data") return;
      if (context?.err?.name === "ConditionalCheckFailedException") return;
      console.log(`${new Date().toLocaleString()}: ${level}: ${result}`);
      console.log(JSON.stringify(context, null, 4) + "\n");
    },
  });
  return oneTableAuditTrail;
};


