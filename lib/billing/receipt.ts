import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from "pdf-lib";
import type { Currency } from "@/lib/entitlements/plans";
import { formatLongDate, formatMoney } from "@/lib/format";
import { encodableText } from "@/lib/pdf/stamp";

export interface ReceiptData {
  number: string;
  paidAt: Date;
  customer: { name: string; email: string; organization?: string | null };
  /** « Abonnement Pro — mensuel » */
  description: string;
  periodStart: Date;
  periodEnd: Date;
  amount: number;
  currency: Currency;
  /** « Mobile Money (MTN) », « Carte bancaire »… */
  method: string;
  reference: string;
  transactionId: string;
  seller: { name: string; url: string; email: string };
  /** Fuseau du client pour les dates du reçu (UTC par défaut). */
  timeZone?: string;
  /** Langue du reçu (celle du client). */
  locale?: "fr" | "en";
}

const RECEIPT_TEXT = {
  fr: {
    title: "Reçu de paiement",
    number: "N°",
    paid: "PAYÉ",
    issuedBy: "Émis par",
    billedTo: "Facturé à",
    description: "Description",
    amount: "Montant",
    period: (from: string, to: string) => `Période du ${from} au ${to}`,
    total: "Total payé",
    method: "Moyen de paiement",
    reference: "Référence",
    transaction: "Transaction",
    thanks:
      "Merci pour votre confiance. Ce reçu atteste du paiement de votre abonnement QuickSign.",
    keep: "Conservez-le pour votre comptabilité. Aucune donnée de carte n'est conservée par QuickSign.",
    docTitle: "Reçu",
    card: "Carte bancaire",
  },
  en: {
    title: "Payment receipt",
    number: "No.",
    paid: "PAID",
    issuedBy: "Issued by",
    billedTo: "Billed to",
    description: "Description",
    amount: "Amount",
    period: (from: string, to: string) => `Period from ${from} to ${to}`,
    total: "Total paid",
    method: "Payment method",
    reference: "Reference",
    transaction: "Transaction",
    thanks:
      "Thank you for your trust. This receipt confirms the payment of your QuickSign subscription.",
    keep: "Keep it for your records. QuickSign never stores card details.",
    docTitle: "Receipt",
    card: "Card",
  },
} as const;

const INK = rgb(0.043, 0.059, 0.102);
const MUTED = rgb(0.4, 0.44, 0.52);
const LINE = rgb(0.9, 0.91, 0.94);
const BRAND = [rgb(0.388, 0.4, 0.945), rgb(0.545, 0.361, 0.965), rgb(0.133, 0.827, 0.933)];

/** Libellé lisible du moyen de paiement renvoyé par le prestataire. */
export function paymentMethodLabel(
  method: string | null | undefined,
  locale: "fr" | "en" = "fr",
): string {
  // Opérateurs pawaPay (MTN_MOMO_CMR, ORANGE_CMR…), moyens Paddle (card, paypal…) et
  // libellés du bac à sable.
  const m = (method ?? "").toLowerCase();
  if (m.includes("momo") || m.includes("mtn")) return "Mobile Money (MTN)";
  if (m.startsWith("om") || m.includes("orange")) return "Orange Money";
  if (m.includes("airtel")) return "Airtel Money";
  if (m.includes("moov")) return "Moov Money";
  if (m.includes("mobilemoney") || m.includes("wallet")) return "Mobile Money";
  if (m.includes("paypal")) return "PayPal";
  if (m.includes("apple_pay")) return "Apple Pay";
  if (m.includes("google_pay")) return "Google Pay";
  if (m.includes("card") || m.includes("visa") || m.includes("master"))
    return RECEIPT_TEXT[locale].card;
  return method || "—";
}

function text(
  page: PDFPage,
  font: PDFFont,
  value: string,
  x: number,
  y: number,
  size: number,
  color = INK,
) {
  page.drawText(encodableText(font, value), { x, y, size, font, color });
}

function rightText(
  page: PDFPage,
  font: PDFFont,
  value: string,
  right: number,
  y: number,
  size: number,
  color = INK,
) {
  const safe = encodableText(font, value);
  page.drawText(safe, { x: right - font.widthOfTextAtSize(safe, size), y, size, font, color });
}

/** Reçu de paiement numéroté (A4, polices standard : léger et lisible partout). */
export async function renderReceipt(data: ReceiptData): Promise<Uint8Array> {
  const lang = data.locale ?? "fr";
  const L = RECEIPT_TEXT[lang];
  const date = (d: Date) => formatLongDate(d, lang, data.timeZone);
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595.28, 841.89]);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const { width, height } = page.getSize();
  const left = 56;
  const right = width - 56;

  // Bandeau dégradé (trois bandes) et logo.
  const bandWidth = width / 3;
  BRAND.forEach((color, i) =>
    page.drawRectangle({ x: i * bandWidth, y: height - 8, width: bandWidth + 1, height: 8, color }),
  );
  page.drawRectangle({ x: left, y: height - 78, width: 30, height: 30, color: BRAND[0] });
  text(page, bold, "Q", left + 9.5, height - 69, 16, rgb(1, 1, 1));
  text(page, bold, data.seller.name, left + 40, height - 68, 18);

  text(page, bold, L.title, left, height - 130, 24);
  text(page, regular, `${L.number} ${data.number}`, left, height - 152, 11, MUTED);
  rightText(page, bold, L.paid, right, height - 130, 14, rgb(0.02, 0.59, 0.41));
  rightText(page, regular, date(data.paidAt), right, height - 152, 11, MUTED);

  // Émetteur / client
  let y = height - 200;
  text(page, bold, L.issuedBy, left, y, 10, MUTED);
  text(page, bold, L.billedTo, width / 2, y, 10, MUTED);
  y -= 18;
  text(page, bold, data.seller.name, left, y, 11);
  text(page, bold, data.customer.name || data.customer.email, width / 2, y, 11);
  y -= 15;
  text(page, regular, data.seller.url.replace(/^https?:\/\//, ""), left, y, 10, MUTED);
  text(page, regular, data.customer.email, width / 2, y, 10, MUTED);
  if (data.customer.organization) {
    y -= 15;
    text(page, regular, data.customer.organization, width / 2, y, 10, MUTED);
  }
  text(page, regular, data.seller.email, left, y - 15, 10, MUTED);

  // Tableau
  y = height - 320;
  page.drawRectangle({
    x: left,
    y: y - 8,
    width: right - left,
    height: 26,
    color: rgb(0.965, 0.969, 0.984),
  });
  text(page, bold, L.description, left + 12, y, 10, MUTED);
  rightText(page, bold, L.amount, right - 12, y, 10, MUTED);
  y -= 36;
  text(page, bold, data.description, left + 12, y, 12);
  rightText(page, bold, formatMoney(data.amount, data.currency, lang), right - 12, y, 12);
  y -= 16;
  text(
    page,
    regular,
    L.period(date(data.periodStart), date(data.periodEnd)),
    left + 12,
    y,
    10,
    MUTED,
  );
  y -= 22;
  page.drawLine({ start: { x: left, y }, end: { x: right, y }, thickness: 1, color: LINE });
  y -= 26;
  text(page, bold, L.total, left + 12, y, 13);
  rightText(page, bold, formatMoney(data.amount, data.currency, lang), right - 12, y, 13);

  // Détails du paiement
  y -= 56;
  const rows: [string, string][] = [
    [L.method, data.method],
    [L.reference, data.reference],
    [L.transaction, data.transactionId],
  ];
  for (const [label, value] of rows) {
    text(page, regular, label, left, y, 10, MUTED);
    text(page, regular, value, left + 140, y, 10);
    y -= 18;
  }

  text(page, regular, L.thanks, left, 90, 9, MUTED);
  text(page, regular, L.keep, left, 76, 9, MUTED);

  pdf.setTitle(`${L.docTitle} ${data.number}`);
  pdf.setAuthor(data.seller.name);
  pdf.setProducer("QuickSign");
  pdf.setCreator("QuickSign");
  pdf.setCreationDate(data.paidAt);
  return pdf.save();
}
