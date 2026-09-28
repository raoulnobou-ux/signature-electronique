/**
 * Détection du type réel d'un fichier à partir de ses premiers octets (« nombres magiques »),
 * indépendamment de l'extension ou du type annoncé par le navigateur.
 */

export type SniffedType = "pdf" | "png" | "jpeg" | "webp" | "zip" | "ole" | "unknown";

const startsWith = (bytes: Uint8Array, signature: number[], offset = 0) =>
  signature.every((b, i) => bytes[offset + i] === b);

export function sniffFileType(head: Uint8Array): SniffedType {
  // Un PDF peut comporter quelques octets parasites avant l'en-tête : on cherche dans le premier Ko.
  const pdfIndex = indexOfAscii(head.subarray(0, 1024), "%PDF-");
  if (pdfIndex !== -1) return "pdf";
  if (startsWith(head, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "png";
  if (startsWith(head, [0xff, 0xd8, 0xff])) return "jpeg";
  if (startsWith(head, [0x52, 0x49, 0x46, 0x46]) && startsWith(head, [0x57, 0x45, 0x42, 0x50], 8))
    return "webp";
  // DOCX / ODT sont des archives ZIP ; DOC (Word 97-2003) est un conteneur OLE.
  if (startsWith(head, [0x50, 0x4b, 0x03, 0x04])) return "zip";
  if (startsWith(head, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) return "ole";
  return "unknown";
}

function indexOfAscii(bytes: Uint8Array, needle: string): number {
  const codes = [...needle].map((c) => c.charCodeAt(0));
  outer: for (let i = 0; i <= bytes.length - codes.length; i++) {
    for (let j = 0; j < codes.length; j++) if (bytes[i + j] !== codes[j]) continue outer;
    return i;
  }
  return -1;
}

export const IMAGE_MIME: Record<"png" | "jpeg" | "webp", string> = {
  png: "image/png",
  jpeg: "image/jpeg",
  webp: "image/webp",
};

/** Nom de fichier sûr : sans chemin, sans caractères de contrôle, longueur bornée. */
export function sanitizeFileName(name: string, fallback = "document"): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  const cleaned = base
    .normalize("NFC")
    .replace(/[\u0000-\u001f\u007f<>:"|?*]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+/, "");
  return (cleaned || fallback).slice(0, 180);
}
