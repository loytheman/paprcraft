// An account's API key: one per account, in its own partition. Only a hash is stored; the token
// (pck_<accountId>_<secret>) is shown once, when it is made or regenerated (service.apiKey.js).

let apiKeyModel;
(async () => {
  const m = await import("../services/index.js");
  const table = m.getOneTable();
  apiKeyModel = table.getModel("ApiKey");
})();

export const apiKeySchema = {
  pk: { type: String, value: "#APIKEY:${accountId}" },
  sk: { type: String, value: "#APIKEY#METADATA" },

  accountId: { type: String, required: true },
  secretHash: { type: String, required: true }, // hex SHA-256 of the secret part
  prefix: { type: String, required: true }, // first characters of the secret, for the dashboard
  rotatedAt: { type: String },
};

export default {
  // exists:null: creating and regenerating are the same write, the new hash replaces the old.
  put: (data) => apiKeyModel.create(data, { exists: null }),
  get: (accountId) => apiKeyModel.get({ accountId }),
  remove: (accountId) => apiKeyModel.remove({ accountId }),
};
