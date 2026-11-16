var exp = 60*60 * 8;
var rf_exp = 60*60 * 24 * 7;
// exp = 10; //10 secs, for testing.

const obj = {
  COOKIE_REFRESH_TOKEN: "rf", //cookie name
  COOKIE_ACCESS_TOKEN: "at", //cookie name
  COOKIE_WAS_LOGGED_IN: "was_logged_in", //cookie name — matches frontend/dashboard's Constant.js, must stay in sync
  PRE_VERIFIED_TOKEN: "pre_verified_token",
  S3_URL_EXPIRY: 100,
  S3_URL_EXPIRY_FOR_WA_UPLOAD: 60 * 3,
  // S3_URL_EXPIRY: 50 * 60, //
  //Default expiry for jwt
  JWT_TOKEN_EXPIRY: process.env.NODE_ENV === "development" ? exp : exp,
  ACCESS_TOKEN_EXPIRY: process.env.NODE_ENV === "development" ? exp : exp,
  ID_TOKEN_EXPIRY: process.env.NODE_ENV === "development" ? exp : exp,
  REFRESH_TOKEN_EXPIRY: process.env.NODE_ENV === "development" ?  rf_exp : rf_exp, // 24 hours in development, 7 days in production
  // PRE_VERIFIED_TOKEN_EXPIRY: 7 * 24 * 60 * 60, // 7 days in production

  // Gap since the customer's last message after which the agent's conversation
  // context is auto-cleared on their next message — same mechanism as a manual
  // "reset" request (see agentContextResetAt on ConversationWa).
  CONTEXT_RESET_STALE_SECONDS: 30 * 60,
};
export default obj;
