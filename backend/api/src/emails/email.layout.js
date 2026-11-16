// The Paprcraft frame every email shares: the logo and name on top, a white card (with a coloured
// top edge for its tone), and a short footer. Mail clients drop <style> and inline SVG, so it's
// tables with inline styles, and the logo is a PNG served from the dashboard's own site
// (frontend/dashboard/public/email/paprcraft-mark.png). The name next to it is text, so the brand
// still shows when images are blocked. Keep in step with emailHtml in backend/lambda/notifierRender.js.
import { getFrontendUrl } from "../services/service.accountAuth.js";

export const escapeHtml = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// Email clients ignore CSS variables, so the brand colours are constants here. Keep them in step with
// frontend/design-system/tokens.css (slate-900 / slate-600 / slate-500 / mint-600).
export const BRAND = { ink: "#0f172a", body: "#475569", muted: "#64748b", primary: "#40ff00", button: "#40ff00", neutral: "#475569", warn: "#ca8a04" };

// A paragraph and a button, styled for the card.
export const para = (htmlText) => `<p style="margin:0 0 12px;font-size:14px;line-height:20px;color:${BRAND.body}">${htmlText}</p>`;
export const button = (href, label) =>
  `<p style="margin:20px 0 0"><a href="${escapeHtml(href)}" style="display:inline-block;padding:10px 16px;border-radius:8px;background:${BRAND.button};color:#0f172a;font-size:14px;font-weight:600;text-decoration:none">${escapeHtml(label)}</a></p>`;

// title: plain text; bodyHtml: already-escaped HTML; accent: the card's top edge;
// footerNote: plain text, why they got this email.
export const brandedEmail = ({ title, bodyHtml, accent = BRAND.primary, footerNote = "" }) => {
  const site = getFrontendUrl();
  return `<!doctype html><html><head><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"></head>
<body style="margin:0;padding:24px 12px;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px">
<tr><td style="padding:0 4px 14px">
<a href="${escapeHtml(site)}" style="text-decoration:none;color:${BRAND.ink}">
<img src="${escapeHtml(site)}/email/paprcraft-mark.png" width="32" height="32" alt="" style="display:inline-block;vertical-align:middle;border:0;outline:none">
<span style="display:inline-block;vertical-align:middle;margin-left:8px;font-size:19px;line-height:32px;font-weight:700;letter-spacing:-0.01em;color:${BRAND.ink}">Paprcraft</span>
</a>
</td></tr>
<tr><td style="background:#ffffff;border-radius:8px;border-top:4px solid ${accent};padding:24px">
<h1 style="margin:0 0 12px;font-size:20px;line-height:28px;color:${BRAND.ink}">${escapeHtml(title)}</h1>
${bodyHtml}
</td></tr>
<tr><td style="padding:16px 4px 0;font-size:12px;line-height:18px;color:${BRAND.muted}">
${footerNote ? `${escapeHtml(footerNote)}<br>` : ""}<strong style="color:${BRAND.body}">Paprcraft</strong> · <a href="https://paprcraft.com" style="color:${BRAND.muted}">paprcraft.com</a>
</td></tr>
</table>
</td></tr></table></body></html>`;
};
