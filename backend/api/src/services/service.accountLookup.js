import { getOneTable } from "./index.js";

// The Account model (looked up lazily: models load after services/index.js).
let accountModel;
export const getAccountModel = () => (accountModel ??= getOneTable().getModel("Account"));
