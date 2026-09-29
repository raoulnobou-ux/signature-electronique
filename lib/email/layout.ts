import type { Locale } from "@/i18n/config";
import { siteConfig } from "@/lib/site";

export type EmailContent = {
  /** Texte d'aperçu affiché par les messageries après l'objet. */
  preheader: string;
  title: string;
  /** Paragraphes (texte brut, échappé automatiquement). */
  paragraphs: string[];
  cta?: { label: string; url: string };
  /** Petite note en bas (ex. « Vous recevez cet e-mail car… »). */
  footnote?: string;
};

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Gabarit d'e-mail de marque : HTML en tableaux et styles en ligne (compatibilité
 * Gmail / Outlook / clients mobiles), plus une version texte brut.
 */
export function renderEmail(
  content: EmailContent,
  locale: Locale = "fr",
): { html: string; text: string } {
  const en = locale === "en";
  const paragraphs = content.paragraphs
    .map(
      (p) =>
        `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#334155;">${escapeHtml(p)}</p>`,
    )
    .join("");

  const cta = content.cta
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:28px 0 8px;">
        <tr><td style="border-radius:12px;background:#6366F1;background-image:linear-gradient(120deg,#6366F1,#8B5CF6 55%,#22D3EE);">
          <a href="${escapeHtml(content.cta.url)}" style="display:inline-block;padding:14px 26px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:12px;">${escapeHtml(content.cta.label)}</a>
        </td></tr>
      </table>
      <p style="margin:12px 0 0;font-size:12px;line-height:1.5;color:#94a3b8;">${en ? "If the button doesn't work, copy this link:" : "Si le bouton ne fonctionne pas, copiez ce lien :"} <br><a href="${escapeHtml(content.cta.url)}" style="color:#6366F1;word-break:break-all;">${escapeHtml(content.cta.url)}</a></p>`
    : "";

  const html = `<!doctype html>
<html lang="${locale}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<title>${escapeHtml(content.title)}</title>
</head>
<body style="margin:0;padding:0;background:#f1f3f9;font-family:Inter,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<span style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(content.preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f3f9;padding:32px 12px;">
  <tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 10px 30px -12px rgba(15,23,42,.18);">
      <tr><td style="height:6px;background:#6366F1;background-image:linear-gradient(90deg,#6366F1,#8B5CF6,#22D3EE);"></td></tr>
      <tr><td style="padding:28px 32px 8px;">
        <table role="presentation" cellpadding="0" cellspacing="0"><tr>
          <td style="width:32px;height:32px;border-radius:9px;background:#6366F1;background-image:linear-gradient(135deg,#6366F1,#8B5CF6,#22D3EE);color:#fff;font-weight:700;font-size:15px;text-align:center;">Q</td>
          <td style="padding-left:10px;font-size:17px;font-weight:700;color:#0b0f1a;letter-spacing:-.01em;">QuickSign</td>
        </tr></table>
      </td></tr>
      <tr><td style="padding:16px 32px 32px;">
        <h1 style="margin:0 0 18px;font-size:22px;line-height:1.3;color:#0b0f1a;letter-spacing:-.01em;">${escapeHtml(content.title)}</h1>
        ${paragraphs}
        ${cta}
      </td></tr>
      <tr><td style="padding:20px 32px;border-top:1px solid #eef0f6;font-size:12px;line-height:1.6;color:#94a3b8;">
        ${content.footnote ? `${escapeHtml(content.footnote)}<br>` : ""}
        QuickSign — ${escapeHtml(en ? "Sign, get it signed, done. In 30 seconds." : siteConfig.tagline)}<br>
        <a href="${siteConfig.url}" style="color:#94a3b8;">${siteConfig.url.replace(/^https?:\/\//, "")}</a>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;

  const text = [
    content.title,
    "",
    ...content.paragraphs.flatMap((p) => [p, ""]),
    content.cta ? `${content.cta.label}${en ? ":" : " :"} ${content.cta.url}` : "",
    "",
    content.footnote ?? "",
    `QuickSign — ${siteConfig.url}`,
  ]
    .filter((line, i, all) => !(line === "" && all[i - 1] === ""))
    .join("\n");

  return { html, text };
}
