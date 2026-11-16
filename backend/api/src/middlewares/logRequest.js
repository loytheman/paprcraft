import axios from "axios";
import dotenv from "dotenv";

// Load environment variables from .env file
dotenv.config();

export const logRequest = (req, res, next) => {
    var str = `[logRequest] ### ${req.method} ${req.protocol}://${req.get("host")}${req.originalUrl}`
    console.log(str);
    next();
};

export const logResponse = (req, res, next) => {
  res.on("finish", () => {
    if(!res.locals?.responseData) return
    const data = {
      method: req.method,
      url: `${req.protocol}://${req.get("host")}${req.originalUrl}`, // Capture the full URL
      headers: req.headers,
      body: req.body,
      responseData: res.locals.responseData,
      ip: req.ip,
    };
    // if (res.statusCode === 200) {
    //   // Todo: Add endpoint for prod
    //   const endpoints = {
    //     'local': 'https://gbnq4vga96.execute-api.ap-southeast-1.amazonaws.com/default/elastic-lambda-fn',
    //     'local-sit': 'https://gbnq4vga96.execute-api.ap-southeast-1.amazonaws.com/default/elastic-lambda-fn',
    //     'sit': 'https://gbnq4vga96.execute-api.ap-southeast-1.amazonaws.com/default/elastic-lambda-fn',
    //     'stage': 'https://api.central.meyzer.xyz/analytic-log',
    //   }
    //   // Todo: Add api key for prod
    //   const apiKeys = {
    //     'local': '6bfba6cd-bf2c-47e7-8a9c-d3ef20e39816',
    //     'local-sit': '6bfba6cd-bf2c-47e7-8a9c-d3ef20e39816',
    //     'sit': '6bfba6cd-bf2c-47e7-8a9c-d3ef20e39816',
    //     'stage': '0190b940-cb7b-7381-9025-f9e58a740c81',
    //   }
    //   const endpoint = endpoints[process.env.STAGE_ENV];
    //   const apiKey = apiKeys[process.env.STAGE_ENV];
    //   if(endpoint && apiKey){
    //     setImmediate(async () => {
    //       try {
    //         await axios.post(endpoint, data, {
    //           headers: {
    //             "elastic-api-key": apiKey, 
    //             "Content-Type": "application/json",
    //           },
    //         });
    //       } catch (error) {
    //         // console.error("Error sending data to Elasticsearch:", error);
    //       }
    //     });
    //   }
    // }
  });
  next();
};

// export default logRequest;
