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
}

const INK = rgb(0.043, 0.059, 0.102);
const MUTED = rgb(0.4, 0.44, 0.52);
const LINE = rgb(0.9, 0.91, 0.94);
const BRAND = [rgb(0.388, 0.4, 0.945), rgb(0.545, 0.361, 0.965), rgb(0.133, 0.827, 0.933)];

/** Libellé lisible du moyen de paiement renvoyé par le prestataire. */
export function paymentMethodLabel(method: string | null | undefined): string {
  const m = (method ?? "").toLowerCase();
  if (m.includes("mtn")) return "Mobile Money (MTN)";
  if (m.includes("orange")) return "Orange Money";
  if (m.includes("mobilemoney")) return "Mobile Money";
  if (m.includes("card")) return "Carte bancaire";
  return method || "—";
}

function text(page: PDFPage, font: PDFFont, value: string, x: number, y: number, size: number, color = INK) {
  page.drawText(encodableText(font, value), { x, y, size, font, color });
}

function rightText(page: PDFPage, font: PDFFont, value: string, right: number, y: number, size: number, color = INK) {
  const safe = encodableText(font, value);
  page.drawText(safe, { x: right - font.widthOfTextAtSize(safe, size), y, size, font, color });
}

/** Reçu de paiement numéroté (A4, polices standard : léger et lisible partout). */
export async function renderReceipt(data: ReceiptData): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595.28, 841.89]);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const { width, height } = page.getSize();
  const left = 56;
  const right = width - 56;

  // Bandeau dégradé (trois bandes) et logo.
  const bandWidth = width / 3;
  BRAND.forEach((color, i) => page.drawRectangle({ x: i * bandWidth, y: height - 8, width: bandWidth + 1, height: 8, color }));
  page.drawRectangle({ x: left, y: height - 78, width: 30, height: 30, color: BRAND[0] });
  text(page, bold, "Q", left + 9.5, height - 69, 16, rgb(1, 1, 1));
  text(page, bold, data.seller.name, left + 40, height - 68, 18);

  text(page, bold, "Reçu de paiement", left, height - 130, 24);
  text(page, regular, `N° ${data.number}`, left, height - 152, 11, MUTED);
  rightText(page, bold, "PAYÉ", right, height - 130, 14, rgb(0.02, 0.59, 0.41));
  rightText(page, regular, formatLongDate(data.paidAt), right, height - 152, 11, MUTED);

  // Émetteur / client
  let y = height - 200;
  text(page, bold, "Émis par", left, y, 10, MUTED);
  text(page, bold, "Facturé à", width / 2, y, 10, MUTED);
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
  page.drawRectangle({ x: left, y: y - 8, width: right - left, height: 26, color: rgb(0.965, 0.969, 0.984) });
  text(page, bold, "Description", left + 12, y, 10, MUTED);
  rightText(page, bold, "Montant", right - 12, y, 10, MUTED);
  y -= 36;
  text(page, bold, data.description, left + 12, y, 12);
  rightText(page, bold, formatMoney(data.amount, data.currency), right - 12, y, 12);
  y -= 16;
  text(page, regular, `Période du ${formatLongDate(data.periodStart)} au ${formatLongDate(data.periodEnd)}`, left + 12, y, 10, MUTED);
  y -= 22;
  page.drawLine({ start: { x: left, y }, end: { x: right, y }, thickness: 1, color: LINE });
  y -= 26;
  text(page, bold, "Total payé", left + 12, y, 13);
  rightText(page, bold, formatMoney(data.amount, data.currency), right - 12, y, 13);

  // Détails du paiement
  y -= 56;
  const rows: [string, string][] = [
    ["Moyen de paiement", data.method],
    ["Référence", data.reference],
    ["Transaction", data.transactionId],
  ];
  for (const [label, value] of rows) {
    text(page, regular, label, left, y, 10, MUTED);
    text(page, regular, value, left + 140, y, 10);
    y -= 18;
  }

  text(page, regular, "Merci pour votre confiance. Ce reçu atteste du paiement de votre abonnement QuickSign.", left, 90, 9, MUTED);
  text(page, regular, "Conservez-le pour votre comptabilité. Aucune donnée de carte n'est conservée par QuickSign.", left, 76, 9, MUTED);

  pdf.setTitle(`Reçu ${data.number}`);
  pdf.setAuthor(data.seller.name);
  pdf.setProducer("QuickSign");
  pdf.setCreator("QuickSign");
  pdf.setCreationDate(data.paidAt);
  return pdf.save();
}
