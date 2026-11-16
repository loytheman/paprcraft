import { SendEmailCommand } from "@aws-sdk/client-ses";
import { getSesClient } from "./index.js";
import config from "../config/config.js";

// Plain transactional email via SES: team invites, plan changes, account closure, email channel
// confirmation. Alerts go out from the notifier Lambda instead (backend/lambda/channels/email.js).
export const sendEmail = async ({ to, subject, html, text }) => {
  const ses = getSesClient();
  await ses.send(
    new SendEmailCommand({
      Source: `"Paprcraft" <${config.ses.fromEmail}>`,
      Destination: { ToAddresses: [to] },
      Message: {
        Subject: { Data: subject, Charset: "UTF-8" },
        Body: {
          Html: { Data: html, Charset: "UTF-8" },
          ...(text ? { Text: { Data: text, Charset: "UTF-8" } } : {}),
        },
      },
    })
  );
};
