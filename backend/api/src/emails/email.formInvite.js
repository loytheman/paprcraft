// "Please fill in this form": sent when someone shares a submission's link with a customer
// (service.submission.js createLink). Names and titles are user text, so they're escaped.
import { brandedEmail, escapeHtml, para, button } from "./email.layout.js";

export const formInviteEmail = ({ senderName, title, url, expiresAt }) => {
  const intro = `${senderName} asked you to fill in a form: ${title}.`;
  const how = `Open the link below, answer the questions and submit. The link works until ${new Date(expiresAt).toUTCString().slice(0, 16)}, and only for this form.`;
  return {
    subject: `${senderName} sent you a form to fill in`,
    text: [intro, "", how, "", `Open the form: ${url}`, "", "If you weren't expecting this, ignore this email."].join("\n"),
    html: brandedEmail({
      title: `Form: ${title}`,
      bodyHtml: para(escapeHtml(intro)) + para(escapeHtml(how)) + button(url, "Open the form"),
      footerNote: "If you weren't expecting this, ignore this email. Nothing happens unless you open the link.",
    }),
  };
};
