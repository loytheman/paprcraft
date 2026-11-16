import pino from "pino";
import config from "./config.js";

const isDev = config.env === "development";

const logger = pino(
  {
    level: "info",
    base: { app: config.app?.name ?? "initializing ..." },
    timestamp: pino.stdTimeFunctions.isoTime,
  },
  isDev
    ? pino.transport({
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: 'SYS:yyyy-mm-dd HH:MM:ss.l', 
          // ignore: "pid,hostname",
        },
      })
    : undefined
);

export default logger;
