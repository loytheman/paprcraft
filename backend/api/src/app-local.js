import fs from "fs/promises";
import https from "https";
import app from "./app.js";
import config from "./config/config.js";
import logger from "./config/logger.js";
import path from "path";
import * as url from "url";

let server;
const awsProfile = process.env.AWS_PROFILE;

const startServer = async () => {
  try {
    const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
    logger.info(`Loading aws profile: [${awsProfile}]`);
    const key = await fs.readFile(path.join(__dirname, "../src/keys/server.key"));
    const cert = await fs.readFile(path.join(__dirname, "../src/keys/server.cert"));

    // https
    server = https.createServer({ key, cert }, app);
    server.listen(config.port, () => logger.info(`HTTPS: Listening on port https://localhost:${config.port}`));

    // //http
    // app.listen(config.port, () => {
    //   console.log(`HTTP: Listening on port http://localhost:${config.port}`);
    // });

  } catch (err) {
    logger.error("Error starting server:", err);
    process.exit(1);
  }
};
startServer();

const shutdownServer = (exitCode = 1) => {
  return server ? server.close(() => (logger.error("Server closed"), process.exit(exitCode))) : process.exit(exitCode);
};
// const unexpectedErrorHandler = (error) => (logger.error("Unexpected Error:", error), shutdownServer());
// process.on("uncaughtException", unexpectedErrorHandler);
// process.on("unhandledRejection", unexpectedErrorHandler);
process.on("SIGTERM", () => (logger.info("SIGTERM received"), shutdownServer(0)));
