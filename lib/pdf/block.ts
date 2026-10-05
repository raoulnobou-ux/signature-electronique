import { z } from "zod";
import type { Field } from "./fields";

/**
 * Bloc professionnel : signature + nom + fonction + structure + date + cachet, posé en une
 * fois dans l'éditeur. Chaque élément reste ensuite un champ ordinaire (déplaçable,
 * redimensionnable, supprimable) ; la date est celle du jour de la signature.
 */
export const signatureBlockSchema = z.object({
  name: z.string().trim().max(80),
  title: z.string().trim().max(80),
  company: z.string().trim().max(120),
  signature: z.boolean(),
  date: z.boolean(),
  stamp: z.boolean(),
});

export type SignatureBlock = z.infer<typeof signatureBlockSchema>;

/** Bloc proposé la première fois, à partir du profil. */
export function defaultSignatureBlock(profile: {
  full_name: string;
  org_name: string | null;
}): SignatureBlock {
  return {
    name: profile.full_name,
    title: "",
    company: profile.org_name ?? "",
    signature: true,
    date: true,
    stamp: false,
  };
}

/** Bloc enregistré dans le profil, ou celui par défaut s'il est absent ou invalide. */
export function readSignatureBlock(
  stored: unknown,
  profile: { full_name: string; org_name: string | null },
): SignatureBlock {
  const parsed = signatureBlockSchema.safeParse(stored);
  return parsed.success ? parsed.data : defaultSignatureBlock(profile);
}

export interface BlockLayoutInput {
  page: number;
  /** Centre souhaité du bloc, en % de la page. */
  centerX: number;
  centerY: number;
  /** Largeur / hauteur de la page affichée. */
  pageAspect: number;
  signature?: { assetId: string; aspect: number } | null;
  stamp?: { assetId: string; aspect: number } | null;
  dateLabel: string;
  newId: () => string;
}

const LINE_H = 2.4;
const LINE_GAP = 0.4;
const TEXT_W = 32;
const SIGNATURE_W = 24;
const STAMP_W = 15;

/**
 * Disposition du bloc : signature en haut, lignes de texte en dessous, cachet à droite.
 * Le bloc est centré sur le point choisi puis ramené dans la page.
 */
export function layoutSignatureBlock(block: SignatureBlock, input: BlockLayoutInput): Field[] {
  const heightFor = (w: number, aspect: number) => (w * input.pageAspect) / aspect;
  const fields: Field[] = [];
  const base = { page: input.page, rotation: 0, opacity: 1 };
  let y = 0;

  if (block.signature && input.signature) {
    const h = heightFor(SIGNATURE_W, input.signature.aspect);
    fields.push({
      ...base,
      id: input.newId(),
      type: "signature",
      x: 0,
      y,
      w: SIGNATURE_W,
      h,
      assetId: input.signature.assetId,
      value: null,
    });
    y += h + LINE_GAP;
  }

  const lines: { type: Field["type"]; value: string }[] = [
    ...(block.name ? [{ type: "name" as const, value: block.name }] : []),
    ...(block.title ? [{ type: "text" as const, value: block.title }] : []),
    ...(block.company ? [{ type: "text" as const, value: block.company }] : []),
    ...(block.date ? [{ type: "date" as const, value: input.dateLabel }] : []),
  ];
  for (const line of lines) {
    fields.push({
      ...base,
      id: input.newId(),
      type: line.type,
      x: 0,
      y,
      w: TEXT_W,
      h: LINE_H,
      assetId: null,
      value: line.value,
    });
    y += LINE_H + LINE_GAP;
  }
  const textHeight = Math.max(0, y - LINE_GAP);

  if (block.stamp && input.stamp) {
    const h = heightFor(STAMP_W, input.stamp.aspect);
    fields.push({
      ...base,
      id: input.newId(),
      type: "stamp",
      // À droite des lignes, légèrement chevauchant comme un vrai tampon.
      x: TEXT_W - 4,
      y: Math.max(0, (textHeight - h) / 2),
      w: STAMP_W,
      h,
      assetId: input.stamp.assetId,
      value: null,
    });
  }
  if (fields.length === 0) return [];

  // Centrage sur le point choisi, puis maintien dans la page.
  const right = Math.max(...fields.map((f) => f.x + f.w));
  const bottom = Math.max(...fields.map((f) => f.y + f.h));
  const clamp = (value: number, size: number) => Math.min(Math.max(0, value), 100 - size);
  const dx = clamp(input.centerX - right / 2, Math.min(right, 100));
  const dy = clamp(input.centerY - bottom / 2, Math.min(bottom, 100));
  return fields.map((f) => ({ ...f, x: f.x + dx, y: f.y + dy }));
}
