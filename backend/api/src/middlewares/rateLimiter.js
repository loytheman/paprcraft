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
