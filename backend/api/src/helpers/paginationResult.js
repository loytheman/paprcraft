import _ from "lodash";

export class PaginationResult {
  constructor(results, limit, gs = "gs0") {
    const { prev, next } = this.preparePagination(results, gs);
    this.results = results;
    this.prev = prev ? PaginationResult.jsonToBase64(prev) : null;
    this.next = next ? PaginationResult.jsonToBase64(next) : null;
    this.limit = limit ?? 20;
  }

  preparePagination(results, gs = "gs0") {
    let prev = null;
    let next = null;
    if (results?.prev) {
      const r1 = results[0];
      prev = {
        pk: r1.pk,
        sk: r1.sk,
        [gs + "pk"]: r1[gs + "pk"],
        [gs + "sk"]: r1[gs + "sk"],
      };
    }
    if (results?.next) {
      const r2 = results[results.length - 1];
      next = {
        pk: r2.pk,
        sk: r2.sk,
        [gs + "pk"]: r2[gs + "pk"],
        [gs + "sk"]: r2[gs + "sk"],
      };
    }
    // console.log("[pagination next]: ", next);
    return { prev, next };
  }

  static jsonToBase64(object) {
    try {
      const json = JSON.stringify(object);
      return Buffer.from(json).toString("base64");
    } catch (e) {
      console.log("jsonToBase64 error", e);
      return null;
    }
  }

  static base64ToJson(base64String) {
    if (!base64String || base64String === "null") return null;

    try {
      const json = Buffer.from(base64String, "base64").toString();
      return JSON.parse(json);
    } catch (e) {
      console.log("base64ToJson error", e);
      return null;
    }
  }
}
