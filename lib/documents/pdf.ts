import { PDFDocument } from "pdf-lib";

export class PdfError extends Error {
  constructor(public code: "encrypted" | "corrupted" | "empty") {
    super(code);
  }
}

/** Vérifie qu'un PDF est lisible, non chiffré, et compte ses pages. */
export async function inspectPdf(bytes: Uint8Array): Promise<{ pageCount: number }> {
  let doc: PDFDocument;
  try {
    doc = await PDFDocument.load(bytes, { updateMetadata: false });
  } catch (error) {
    if (error instanceof Error && /encrypt/i.test(error.message)) throw new PdfError("encrypted");
    throw new PdfError("corrupted");
  }
  if (doc.isEncrypted) throw new PdfError("encrypted");
  const pageCount = doc.getPageCount();
  if (pageCount === 0) throw new PdfError("empty");
  return { pageCount };
}

const A4 = { width: 595.28, height: 841.89 };
const MARGIN = 0;

/**
 * Photo ou scan → PDF A4 (portrait ou paysage selon l'image), image centrée et
 * ajustée sans déformation. Formats : JPEG, PNG.
 */
export async function imageToPdf(bytes: Uint8Array, type: "jpeg" | "png"): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const image = type === "png" ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
  const landscape = image.width > image.height;
  const page = doc.addPage(landscape ? [A4.height, A4.width] : [A4.width, A4.height]);
  const { width, height } = page.getSize();
  const scale = Math.min((width - MARGIN * 2) / image.width, (height - MARGIN * 2) / image.height);
  const w = image.width * scale;
  const h = image.height * scale;
  page.drawImage(image, { x: (width - w) / 2, y: (height - h) / 2, width: w, height: h });
  doc.setProducer("QuickSign");
  doc.setCreator("QuickSign");
  return doc.save();
}
