import pkg from "../package.json" with { type: "json" };
import { fileURLToPath } from "url";
import { dirname } from "path";
import dotenv from "dotenv";
import path from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const envFile = ".env." + process.env.STAGE_ENV;
dotenv.config({ path: path.resolve(__dirname, `../${envFile}`)});
//loynote: .env.secret is not uploaded to lambda, configure in lambda env variable instead
dotenv.config({ path: path.resolve(__dirname, '../.env.secret'), override:true });

// console.log("load env file ------> ", envFile);
const envVars = process.env;

const obj = {
  app: { name: pkg.name, version: pkg.version },
  env: envVars.NODE_ENV,
  stageEnv: envVars.STAGE_ENV,
  port: envVars.PORT,
  defaultOrganizationId: envVars.DEFAULT_ORGANIZATION_ID,
  jwt: {
    userSecret: envVars.JWT_USER_SECRET,
  },
  
  aws: {
    region: envVars.AWS_REGION,
    s3Bucket: envVars.AWS_S3_BUCKET,
    s3BaseUrl: envVars.AWS_S3_BASE_URL,
    //AWS_LAMBDA_FUNCTION_NAME is set automatically by the AWS Lambda runtime to the currently-executing function's name 
    // — it's not something we configure.,
    selfInvokeFuncName: envVars.AWS_LAMBDA_FUNCTION_NAME
    
  },
  // The docx template renderer (backend/lambda/docxTemplate.js, infra/29-docx-template.sh).
  docx: {
    lambdaName: envVars.DOCX_LAMBDA_NAME,
  },
  ses: {
    fromEmail: envVars.SES_FROM_EMAIL,
  },
  db: {
    table: envVars.DYNAMODB_TABLE,
    auditTrail: envVars.DYNAMODB_TABLE_AUDIT_TRAIL,
  },
  cors: envVars.ALLOWED_ORIGIN,
  // "Sign in with Google" (service.accountAuth.js). clientId is public (it's in the auth URL);
  // clientSecret is a real secret, set directly as a Lambda env var (never via .env.stage/.env.prod).
  google: {
    clientId: envVars.GOOGLE_CLIENT_ID,
    clientSecret: envVars.GOOGLE_CLIENT_SECRET,
  },
};

// Deep-redacts any key that looks like a secret before this ever hits a log — this printed a
// real Google OAuth client secret in plaintext during testing before this existed. Matches by
// key name (secret/apikey/password), not an allowlist, so a newly added secret-shaped config
// value is redacted by default instead of needing someone to remember to add it here.
const redactSecrets = (value) => {
  if (Array.isArray(value)) return value.map(redactSecrets);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, /secret|apikey|password/i.test(k) && v ? "[REDACTED]" : redactSecrets(v)])
    );
  }
  return value;
};

console.log("environment variables ------> ", redactSecrets(obj));

export default obj;
