/** Taille maximale d'un fichier importé (paramétrable via NEXT_PUBLIC_MAX_UPLOAD_MB). */
export const MAX_UPLOAD_MB = Number(process.env.NEXT_PUBLIC_MAX_UPLOAD_MB ?? 25) || 25;
export const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024;

/** Extensions proposées dans le sélecteur de fichiers (le type réel est vérifié côté serveur). */
export const ACCEPTED_EXTENSIONS = [
  ".pdf",
  ".doc",
  ".docx",
  ".odt",
  ".rtf",
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
];
export const ACCEPT_ATTRIBUTE = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.oasis.opendocument.text",
  "application/rtf",
  "image/jpeg",
  "image/png",
  "image/webp",
  ...ACCEPTED_EXTENSIONS,
].join(",");

/** Dimension maximale (px) d'une photo avant import : A4 à 300 dpi, fichiers légers. */
export const MAX_IMAGE_EDGE = 2480;

export type DocumentKind = "pdf" | "word" | "image";
