// express-rate-limit (v8) store backed by the main DynamoDB table, so limits hold across Lambda
// instances (the default in-memory store resets on every cold start and isn't shared).
// One row per key per time window: pk "#RATELIMIT:<name>:<key>:<window>", sk "#RATE_LIMIT", with
// a `ttl` (epoch seconds, the table's TTL attribute, see infra/02-dynamodb-ttl.sh) so rows clean
// themselves up. Needs no schema change: it writes through the plain DynamoDB client.
import Utils from "../helpers/utils.js";
import config from "../config/config.js";
import { getDynamoDbClient } from "../services/index.js";

const SK = "#RATE_LIMIT";

export default class RateLimitDynamoDbStore {
  // name: keeps limiters apart (e.g. "auth", "otp"). Used as `store: new RateLimitDynamoDbStore(...)`
  // with a *separate store instance per limiter*, as express-rate-limit requires.
  constructor(name = "default", table = config.db.table) {
    this.name = name;
    this.table = table;
    this.localKeys = false; // shared across instances (tells express-rate-limit not to warn)
  }

  init(options) {
    this.windowMs = options.windowMs;
  }

  #key(key) {
    const window = Math.floor(Date.now() / this.windowMs);
    return { pk: `#RATELIMIT:${this.name}:${key}:${window}`, sk: SK, window };
  }

  async increment(key) {
    const { pk, window } = this.#key(key);
    const resetTime = new Date((window + 1) * this.windowMs);
    const res = await getDynamoDbClient().update({
      TableName: this.table,
      Key: { pk, sk: SK },
      UpdateExpression: "ADD #hits :one SET #ttl = :ttl",
      ExpressionAttributeNames: { "#hits": "hits", "#ttl": "ttl" },
      ExpressionAttributeValues: { ":one": 1, ":ttl": Utils.timestamp(Math.ceil(this.windowMs / 1000) + 60) },
      ReturnValues: "UPDATED_NEW",
    });
    return { totalHits: res.Attributes.hits, resetTime };
  }

  async decrement(key) {
    const { pk } = this.#key(key);
    await getDynamoDbClient()
      .update({
        TableName: this.table,
        Key: { pk, sk: SK },
        UpdateExpression: "ADD #hits :minus",
        ConditionExpression: "attribute_exists(pk)",
        ExpressionAttributeNames: { "#hits": "hits" },
        ExpressionAttributeValues: { ":minus": -1 },
      })
      .catch(() => {}); // row gone (window over): nothing to take back
  }

  async resetKey(key) {
    const { pk } = this.#key(key);
    await getDynamoDbClient().delete({ TableName: this.table, Key: { pk, sk: SK } });
  }
}
