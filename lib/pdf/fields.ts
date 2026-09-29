import { z } from "zod";

/**
 * Champs posés sur un document. Positions et tailles en POURCENTAGE de la page
 * telle qu'elle est affichée (après rotation) : rendu identique sur tous les écrans.
 */
export const FIELD_TYPES = [
  "signature",
  "initials",
  "stamp",
  "date",
  "text",
  "checkbox",
  "name",
  "mention",
] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

export const IMAGE_FIELD_TYPES: readonly FieldType[] = ["signature", "initials", "stamp"];
export const isImageField = (type: FieldType) => IMAGE_FIELD_TYPES.includes(type);

export const fieldSchema = z
  .object({
    id: z.string().min(1).max(64),
    page: z.number().int().min(0).max(4999),
    x: z.number().min(0).max(100),
    y: z.number().min(0).max(100),
    w: z.number().min(0.5).max(100),
    h: z.number().min(0.3).max(100),
    rotation: z.number().min(-45).max(45).default(0),
    opacity: z.number().min(0.1).max(1).default(1),
    type: z.enum(FIELD_TYPES),
    assetId: z.uuid().nullish(),
    value: z.string().max(500).nullish(),
  })
  .refine((f) => f.x + f.w <= 100.5 && f.y + f.h <= 100.5, "hors de la page")
  .refine((f) => !isImageField(f.type) || Boolean(f.assetId), "image manquante");

export type Field = z.infer<typeof fieldSchema>;

export const fieldsSchema = z.array(fieldSchema).max(500);

/** Mentions proposées dans l'éditeur. */
export const MENTIONS = [
  "Lu et approuvé",
  "Bon pour accord",
  "Pour accord",
  "Certifié conforme",
  "Vu et vérifié",
];
export const MENTIONS_EN = [
  "Read and approved",
  "Approved",
  "Agreed",
  "Certified true copy",
  "Seen and verified",
];

/** Mentions manuscrites usuelles dans la langue de l'interface. */
export function mentionsFor(locale: string): string[] {
  return locale === "en" ? MENTIONS_EN : MENTIONS;
}

/** « 28 septembre 2026, Douala » (ou « 28 September 2026, Douala ») dans le fuseau de l'utilisateur. */
export function formatSignatureDate(
  date: Date,
  timeZone: string,
  city?: string | null,
  locale = "fr",
): string {
  const formatted = new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone,
  }).format(date);
  return city ? `${formatted}, ${city}` : formatted;
}
