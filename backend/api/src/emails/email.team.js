// Team emails (service.team.js): an invite, being removed, and access paused or restored when the
// account leaves or rejoins Pro. Names are user text, so they're escaped (brandedEmail's helpers).
import { brandedEmail, escapeHtml, para, button, BRAND } from "./email.layout.js";

const ROLE_TEXT = {
  member: "Member: you can manage monitors, reminders, alerts, status pages and labels",
  viewer: "Viewer: you can see everything, but not change it",
};

// accountName: whose account ("Loy Tan" or their email); inviterName: who sent it.
export const teamInviteEmail = ({ accountName, inviterName, role, inviteUrl }) => {
  const title = `Join ${accountName} on Paprcraft`;
  const intro = `${inviterName} invited you to their Paprcraft account, ${accountName}.`;
  const roleLine = `Your role: ${ROLE_TEXT[role]}.`;
  const how = "Sign in with Google using this email address to accept. The invite works for 7 days.";
  return {
    subject: `${inviterName} invited you to their Paprcraft account`,
    text: [intro, "", roleLine, "", how, "", `Accept the invite: ${inviteUrl}`, "", "If you weren't expecting this, ignore this email."].join("\n"),
    html: brandedEmail({
      title,
      bodyHtml: para(escapeHtml(intro)) + para(escapeHtml(roleLine)) + para(escapeHtml(how)) + button(inviteUrl, "Accept invite"),
      footerNote: "If you weren't expecting this, ignore this email. Nothing happens unless you accept.",
    }),
  };
};

export const teamRemovedEmail = ({ accountName }) => {
  const line = `You no longer have access to ${accountName}'s Paprcraft account.`;
  return {
    subject: `You've been removed from ${accountName} on Paprcraft`,
    text: [line, "", "Your own Paprcraft account, if you have one, isn't affected."].join("\n"),
    html: brandedEmail({ title: "Removed from an account", accent: BRAND.neutral, bodyHtml: para(escapeHtml(line)) + para("Your own Paprcraft account, if you have one, isn't affected."), footerNote: "Sent by Paprcraft about your access." }),
  };
};

// paused: the account left Pro (teams are a Pro feature); restored: it's back on Pro.
export const teamAccessEmail = ({ accountName, paused, dashboardUrl }) => {
  const line = paused
    ? `${accountName}'s Paprcraft account is no longer on Pro, so your access to it is paused. You stay on the team, and your access comes back if the account returns to Pro.`
    : `${accountName}'s Paprcraft account is back on Pro, so you can use it again.`;
  return {
    subject: paused ? `Your access to ${accountName} on Paprcraft is paused` : `Your access to ${accountName} on Paprcraft is back`,
    text: [line, ...(paused ? [] : ["", `Open Paprcraft: ${dashboardUrl}`])].join("\n"),
    html: brandedEmail({
      title: paused ? "Access paused" : "Access restored",
      accent: paused ? BRAND.warn : BRAND.primary,
      bodyHtml: para(escapeHtml(line)) + (paused ? "" : button(dashboardUrl, "Open Paprcraft")),
      footerNote: "Sent by Paprcraft about your access.",
    }),
  };
};
