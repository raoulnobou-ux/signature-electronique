import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from "pdf-lib";
import QRCode from "qrcode";
import { encodableText } from "@/lib/pdf/stamp";
import { describeDevice } from "./device";

export interface CertificateSigner {
  name: string;
  email: string | null;
  phone: string | null;
  signedAt: Date | null;
  status: string;
  ip: string | null;
  userAgent: string | null;
  sha256Before: string | null;
  sha256After: string | null;
}

export interface CertificateData {
  requestId: string;
  documentTitle: string;
  ownerName: string;
  ownerEmail: string;
  mode: "sequential" | "parallel";
  createdAt: Date;
  completedAt: Date;
  originalSha256: string;
  finalSha256: string;
  verifyUrl: string;
  signers: CertificateSigner[];
  events: { at: Date; label: string }[];
  timeZone?: string;
}

const INK = rgb(0.043, 0.059, 0.102);
const MUTED = rgb(0.4, 0.44, 0.52);
const LINE = rgb(0.9, 0.91, 0.94);
const BRAND = [rgb(0.388, 0.4, 0.945), rgb(0.545, 0.361, 0.965), rgb(0.133, 0.827, 0.933)];
const A4: [number, number] = [595.28, 841.89];
const LEFT = 50;
const RIGHT = A4[0] - 50;

export function formatInstant(date: Date, timeZone = "Africa/Douala"): string {
  const local = new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeStyle: "medium", timeZone }).format(date);
  return `${local} (${timeZone}) — ${date.toISOString().replace("T", " ").slice(0, 19)} UTC`;
}

/** Découpe un texte en lignes qui tiennent dans `width`. */
function wrap(font: PDFFont, text: string, size: number, width: number): string[] {
  const words = encodableText(font, text).split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) > width && line) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * Certificat de signature : identité déclarée et coordonnées des signataires, horodatage
 * (fuseau local + UTC), adresse IP, appareil, empreintes SHA-256 avant/après, chronologie,
 * cadre juridique, et QR code vers la page publique de vérification.
 */
export async function renderCertificate(data: CertificateData): Promise<Uint8Array> {
  const tz = data.timeZone ?? "Africa/Douala";
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const mono = await pdf.embedFont(StandardFonts.Courier);
  const qr = await pdf.embedPng(await QRCode.toBuffer(data.verifyUrl, { type: "png", margin: 1, width: 240, errorCorrectionLevel: "M" }));

  let page: PDFPage = pdf.addPage(A4);
  let y = 0;

  const header = () => {
    const band = A4[0] / 3;
    BRAND.forEach((color, i) => page.drawRectangle({ x: i * band, y: A4[1] - 7, width: band + 1, height: 7, color }));
    page.drawText("QuickSign", { x: LEFT, y: A4[1] - 40, size: 13, font: bold, color: INK });
    page.drawText(encodableText(regular, `Certificat · Réf. ${data.requestId}`), { x: LEFT, y: A4[1] - 54, size: 8, font: regular, color: MUTED });
    y = A4[1] - 80;
  };
  const ensure = (needed: number) => {
    if (y - needed < 60) {
      page = pdf.addPage(A4);
      header();
    }
  };
  const text = (value: string, opts: { size?: number; font?: PDFFont; color?: typeof INK; x?: number; width?: number; gap?: number } = {}) => {
    const size = opts.size ?? 10;
    const font = opts.font ?? regular;
    for (const line of wrap(font, value, size, opts.width ?? RIGHT - (opts.x ?? LEFT))) {
      ensure(size + 4);
      page.drawText(line, { x: opts.x ?? LEFT, y, size, font, color: opts.color ?? INK });
      y -= size + (opts.gap ?? 4);
    }
  };
  const rule = () => {
    y -= 6;
    page.drawLine({ start: { x: LEFT, y }, end: { x: RIGHT, y }, thickness: 1, color: LINE });
    y -= 16;
  };
  const row = (label: string, value: string, valueFont: PDFFont = regular, size = 9.5) => {
    const lines = wrap(valueFont, value, size, RIGHT - LEFT - 150);
    ensure(lines.length * (size + 3) + 4);
    page.drawText(encodableText(regular, label), { x: LEFT, y, size: 9, font: regular, color: MUTED });
    for (const line of lines) {
      page.drawText(line, { x: LEFT + 150, y, size, font: valueFont, color: INK });
      y -= size + 3;
    }
    y -= 3;
  };

  header();
  page.drawImage(qr, { x: RIGHT - 92, y: A4[1] - 170, width: 92, height: 92 });
  page.drawText("Vérifier en ligne", { x: RIGHT - 83, y: A4[1] - 180, size: 7.5, font: regular, color: MUTED });
  text("Certificat de signature électronique", { size: 20, font: bold, width: RIGHT - LEFT - 110, gap: 8 });
  text(data.documentTitle, { size: 12, color: MUTED, width: RIGHT - LEFT - 110 });
  y = Math.min(y, A4[1] - 196);
  rule();

  row("Document", data.documentTitle, bold);
  row("Émis par", `${data.ownerName} <${data.ownerEmail}>`);
  row("Mode", data.mode === "sequential" ? "Signature dans l'ordre (séquentielle)" : "Signature simultanée (parallèle)");
  row("Demande créée", formatInstant(data.createdAt, tz));
  row("Signature complète", formatInstant(data.completedAt, tz));
  row("SHA-256 original", data.originalSha256, mono, 8);
  row("SHA-256 final", data.finalSha256, mono, 8);
  row("Vérification", data.verifyUrl);
  rule();

  text("Signataires", { size: 13, font: bold, gap: 10 });
  data.signers.forEach((s, i) => {
    ensure(110);
    text(`${i + 1}. ${s.name}`, { size: 11, font: bold, gap: 6 });
    if (s.email) row("E-mail", s.email);
    if (s.phone) row("Téléphone", s.phone);
    row("Statut", s.status === "signed" ? "Signé" : s.status);
    if (s.signedAt) row("Signé le", formatInstant(s.signedAt, tz));
    row("Adresse IP", s.ip ?? "—");
    row("Appareil", describeDevice(s.userAgent));
    if (s.sha256Before) row("SHA-256 avant", s.sha256Before, mono, 8);
    if (s.sha256After) row("SHA-256 après", s.sha256After, mono, 8);
    y -= 6;
  });
  rule();

  text("Chronologie", { size: 13, font: bold, gap: 10 });
  for (const event of data.events) {
    const when = formatInstant(event.at, tz);
    ensure(28);
    page.drawText(encodableText(regular, when), { x: LEFT, y, size: 8, font: regular, color: MUTED });
    y -= 11;
    text(event.label, { size: 9.5, gap: 8 });
  }
  rule();

  text("Cadre juridique", { size: 13, font: bold, gap: 10 });
  text(
    "Ce document a été signé au moyen d'une signature électronique simple. Sa valeur probante repose sur la traçabilité enregistrée par QuickSign : identité déclarée et coordonnées de chaque signataire, lien de signature personnel, horodatage, adresse IP, appareil utilisé et empreintes numériques (SHA-256) du document avant et après chaque signature. Références : loi n° 2010/012 du 21 décembre 2010 relative à la cybersécurité et à la cybercriminalité au Cameroun, et Acte uniforme OHADA relatif au droit commercial général (écrit et signature électroniques). Il ne s'agit pas d'une signature électronique qualifiée.",
    { size: 9, color: MUTED, gap: 3 },
  );
  y -= 8;
  text(
    "Pour vérifier l'authenticité d'un exemplaire, ouvrez le lien ou le QR code ci-dessus et déposez le fichier : son empreinte est comparée à celle enregistrée. Toute modification, même d'un seul caractère, change l'empreinte.",
    { size: 9, color: MUTED, gap: 3 },
  );

  const pages = pdf.getPages();
  pages.forEach((p, i) =>
    p.drawText(`Page ${i + 1} / ${pages.length}`, { x: RIGHT - 50, y: 30, size: 8, font: regular, color: MUTED }),
  );
  pdf.setTitle(`Certificat de signature — ${data.documentTitle}`);
  pdf.setAuthor("QuickSign");
  pdf.setProducer("QuickSign");
  pdf.setCreator("QuickSign");
  pdf.setCreationDate(data.completedAt);
  pdf.setKeywords([data.requestId, data.finalSha256]);
  return pdf.save();
}
