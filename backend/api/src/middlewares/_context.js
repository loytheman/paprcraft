// This will hold the "storage" container.

import { AsyncLocalStorage } from 'async_hooks';
import config from "../config/config.js";

export const organizationContext = new AsyncLocalStorage();
export const setDefaultOrganizationContext = async (req, res, next) => {

  try {
    let orgId = req.headers['x-org-id'];
    if (!orgId) {
      orgId = config.defaultOrganizationId; //default
    }

    let activeOrg = { orgId: orgId };
    // console.log("[setDefaultOrganizationContext] activeOrg: ", activeOrg);
    organizationContext.run(activeOrg, () => {
        next();
    });


  } catch (err) {
    console.log("[setDefaultOrganizationContext] err: ", err)
    res.status(500).json({ error: "Failed to setDefaultOrganization" });
  }
};
