import { sniffFileType } from "@/lib/files/sniff";
import type { DocumentConverter } from "./convert";
import { MAX_UPLOAD_BYTES, type DocumentKind } from "./limits";
import { detectZipOffice, isRtf, type OfficeFormat } from "./office";
import { imageToPdf, inspectPdf, PdfError } from "./pdf";

export type ProcessErrorCode =
  | "too_large"
  | "empty"
  | "unsupported"
  | "encrypted"
  | "corrupted"
  | "conversion_failed"
  | "conversion_unavailable";

export class ProcessError extends Error {
  constructor(public code: ProcessErrorCode) {
    super(code);
  }
}

export type ProcessedDocument = {
  kind: DocumentKind;
  /** Type réel détecté (sert d'extension au fichier d'origine stocké). */
  detected: "pdf" | OfficeFormat | "jpeg" | "png";
  /** PDF prêt à signer (identique à l'original pour un PDF). */
  pdf: Uint8Array;
  pageCount: number;
};

/**
 * Transforme n'importe quel fichier accepté en PDF signable, après vérification du
 * type réel (octets), sans se fier à l'extension ni au type annoncé.
 */
export async function processDocument(
  bytes: Uint8Array,
  converter: DocumentConverter,
): Promise<ProcessedDocument> {
  if (bytes.byteLength === 0) throw new ProcessError("empty");
  if (bytes.byteLength > MAX_UPLOAD_BYTES) throw new ProcessError("too_large");

  const sniffed = sniffFileType(bytes.subarray(0, 1024));

  if (sniffed === "pdf") {
    const { pageCount } = await inspectPdfOrThrow(bytes);
    return { kind: "pdf", detected: "pdf", pdf: bytes, pageCount };
  }

  if (sniffed === "jpeg" || sniffed === "png") {
    let pdf: Uint8Array;
    try {
      pdf = await imageToPdf(bytes, sniffed);
    } catch {
      throw new ProcessError("corrupted");
    }
    return { kind: "image", detected: sniffed, pdf, pageCount: 1 };
  }

  let office: OfficeFormat | null = null;
  if (sniffed === "zip") office = await detectZipOffice(bytes);
  else if (sniffed === "ole") office = "doc";
  else if (isRtf(bytes)) office = "rtf";
  if (!office) throw new ProcessError("unsupported");

  let pdf: Uint8Array;
  try {
    pdf = await converter.toPdf(bytes, office);
  } catch (error) {
    const code = (error as { code?: string }).code;
    throw new ProcessError(
      code === "not_configured" ? "conversion_unavailable" : "conversion_failed",
    );
  }
  const { pageCount } = await inspectPdfOrThrow(pdf);
  return { kind: "word", detected: office, pdf, pageCount };
}

async function inspectPdfOrThrow(bytes: Uint8Array) {
  try {
    return await inspectPdf(bytes);
  } catch (error) {
    if (error instanceof PdfError)
      throw new ProcessError(error.code === "encrypted" ? "encrypted" : "corrupted");
    throw new ProcessError("corrupted");
  }
}
