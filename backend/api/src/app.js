import compression from "compression";
import cookieParser from "cookie-parser";
import { responseFormat } from "./middlewares/responseFormat.js";
import { logRequest } from "./middlewares/logRequest.js";
import { router } from "./routes/v1/index.js";
import { errorConverter, errorHandler, catchNotFound } from "./middlewares/error.js";
import { configureCORS, helmetPolicy, appendVersion, sendAppInfo, sendRouteDetails } from "./middlewares/setup.js";
import { clientInfoBehaviour } from "./middlewares/behaviour.js";
import { setDefaultOrganizationContext } from "./middlewares/_context.js";
// import { loadGlobalSettings } from "./middlewares/cacheMiddleware.js";

import express from "express";

const app = express();

app.disable('x-powered-by');

app.use(helmetPolicy);
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));
app.use(cookieParser());
// No input sanitizer: what people type is stored as typed ("R&D", "a > b", "sunday&me.jpg").
// It's escaped where it's shown: the dashboard and status page (Vue), API emails (escapeHtml in
// emails/email.layout.js) and alerts (backend/lambda/notifierRender.js). The old express-xss-
// sanitizer stored "&" as "&amp;" in every field and never made anything safer.
app.use(compression());
app.use(configureCORS);
// app.use(loadGlobalSettings);
app.use(setDefaultOrganizationContext);
app.options("/{*path}", configureCORS);
// app.use(sendRouteDetails);
app.use(responseFormat);
app.use(clientInfoBehaviour);
app.use(logRequest)
app.use(appendVersion);
app.get("/", sendAppInfo);
app.get("/test", sendAppInfo);


app.use("/v1", router);
app.use(catchNotFound);
app.use(errorConverter);
app.use(errorHandler);

export default app;
