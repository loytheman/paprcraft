import { rateLimit } from "express-rate-limit";
import RateLimitDynamoDbStore from "./rateLimitDynamoDbStore.js";

// Per-IP limits, shared across Lambda instances via DynamoDB. Use as route middleware, e.g.
//   r.post("/auth/login", authLimiter, joi(s.getLogin), c.login)
// (not wired into the routes by default). Each limiter needs its own store instance.
// Behind API Gateway the client IP is in X-Forwarded-For; app-local/app-lambda should
// `app.set("trust proxy", 1)` before relying on req.ip.
const windowMs = 60 * 1000; // 1 min

export const authLimiter = rateLimit({
  windowMs,
  limit: 10,
  skipSuccessfulRequests: true,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  store: new RateLimitDynamoDbStore("auth"),
});

export const otpLimiter = rateLimit({
  windowMs,
  limit: 3,
  skipSuccessfulRequests: true,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  store: new RateLimitDynamoDbStore("otp"),
});

// Customer form links (no login): per IP. Reading and saving a form is chatty (autosave), submitting
// is rare. The key is the client IP the app already works out (middlewares/behaviour.js).
const byIp = (req) => req.clientInfo?.ip || "unknown";

export const publicFormLimiter = rateLimit({
  windowMs,
  limit: 120,
  keyGenerator: byIp,
  validate: false,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  store: new RateLimitDynamoDbStore("form-link"),
  message: { status: "fail", message: "Too many requests. Please wait a minute and try again." },
});

export const publicSubmitLimiter = rateLimit({
  windowMs,
  limit: 10,
  keyGenerator: byIp,
  validate: false,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  store: new RateLimitDynamoDbStore("form-submit"),
  message: { status: "fail", message: "Too many attempts. Please wait a minute and try again." },
});
