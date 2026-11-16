// "Your Paprcraft account is closed": sent once an account has been closed, by its owner from
// Settings > Account or by Paprcraft staff (service.accountClosure.js). Says what was deleted, that
// a paid plan ended without a refund, and what is kept.
import { brandedEmail, escapeHtml, para } from "./email.layout.js";

// counts = { labels, ... }: what was deleted, one entry per record type (add yours below); hadPlan: a paid plan was cancelled.
export const accountClosedEmail = ({ firstName, counts, hadPlan, byStaff }) => {
  const hello = firstName ? `Hi ${firstName},` : "Hi,";
  const opening = byStaff ? "Paprcraft support has closed your Paprcraft account." : "Your Paprcraft account is now closed, as you asked.";
  const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
  const deleted = [
    counts.labels && plural(counts.labels, "label"),
    counts.templates && plural(counts.templates, "document template"),
    counts.forms && plural(counts.forms, "form"),
    counts.submissions && plural(counts.submissions, "form submission"),
  ].filter(Boolean);
  const lines = [
    deleted.length ? `We've deleted ${deleted.join(", ")}, with their history.` : "We've deleted your data.",
    ...(hadPlan ? ["Your paid plan was cancelled. Unused time isn't refunded, and nothing more will be charged."] : []),
    "As our Privacy Policy describes, we keep billing records as tax law requires and a record of account activity for security.",
    "If you didn't ask for this, reply to this email or write to support@paprcraft.com.",
  ];

  const text = [hello, "", opening, "", ...lines.flatMap((l) => [l, ""]), "Thanks for using Paprcraft."].join("\n");
  const html = brandedEmail({
    title: "Your account is closed",
    accent: "#475569",
    bodyHtml: [hello, opening, ...lines, "Thanks for using Paprcraft."].map((l) => para(escapeHtml(l))).join("\n"),
    footerNote: "Sent by Paprcraft about your account.",
  });
  return { subject: "Your Paprcraft account is closed", text, html };
};
