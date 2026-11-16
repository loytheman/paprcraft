import config from "../config/config.js";
import helmet from "helmet";
import cors from "cors";
import logger from "../config/logger.js";

// ALLOWED_ORIGIN in .env.<stage>, comma-separated. Requests with no Origin header (browser
// navigations such as the Google OAuth redirects, curl, server-to-server) pass through. A
// disallowed origin just gets no CORS headers, so the browser blocks the response — no error.
const allowedOrigins = (config.cors || "").split(",").map((o) => o.trim()).filter(Boolean);

const appCors = cors({
  origin: (origin, callback) => callback(null, !origin || allowedOrigins.includes(origin)),
  allowedHeaders: ["Content-Type", "Access-Control-Allow-Credentials", "Authorization", "Token", "x-org-id", "X-Paprcraft-Account"],
  credentials: true,
  optionsSuccessStatus: 200,
});

// /v1/public/* is read by status pages on any subdomain (later, customers' own domains): open to
// every origin, and without credentials, so no session can ride along.
const publicCors = cors({ origin: "*", methods: ["GET", "HEAD"], optionsSuccessStatus: 200 });

export const configureCORS = (req, res, next) => (req.path.startsWith("/v1/public/") ? publicCors : appCors)(req, res, next);

export const helmetPolicy = helmet.contentSecurityPolicy({
  directives: {
    defaultSrc: ["'self'", "*"],
    scriptSrc: ["'self'", "*", "'unsafe-inline'"],
    styleSrc: ["'self'", "*", "'unsafe-inline'"],
    formAction: ["'self'", "*"],
    imgSrc: ["'self'", "*", "data:"],
  },
});

export const appendVersion = async (req, res, next) => {
  res.append("gvs-api-version", config.app.version);
  next();
};

export const sendAppInfo = async (req, res) => {
  console.log("[sendAppInfo]: ", req.url)

  // res.send("yay");
  
  res.json({
    appName: config.app.name,
    api: "v1",
    env: config.env,
    stageEnv: config.stageEnv,
    apiVersion: config.app.version,
  });
};

export const sendRouteDetails = async (req, res, next) => {
  // logger.info(req.method + " " + req.originalUrl)
  next();
};
