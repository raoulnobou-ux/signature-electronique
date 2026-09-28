import { z } from "zod";

/**
 * Zones d'une demande de signature : chacune est attribuée à un signataire (index dans
 * la liste). Positions en % de la page affichée, comme dans l'éditeur.
 * Le signataire remplit signature, paraphe, texte et case ; date, nom et mention sont
 * complétés automatiquement au moment de la signature.
 */
export const REQUEST_FIELD_TYPES = ["signature", "initials", "date", "name", "text", "checkbox", "mention"] as const;
export type RequestFieldType = (typeof REQUEST_FIELD_TYPES)[number];

export const MAX_SIGNERS = 10;

export const requestFieldSchema = z
  .object({
    id: z.string().min(1).max(64),
    signer: z.number().int().min(0).max(MAX_SIGNERS - 1),
    page: z.number().int().min(0).max(4999),
    x: z.number().min(0).max(100),
    y: z.number().min(0).max(100),
    w: z.number().min(0.5).max(100),
    h: z.number().min(0.3).max(100),
    type: z.enum(REQUEST_FIELD_TYPES),
    /** Libellé (texte), mention choisie, ou « true » pour une case cochée par défaut. */
    value: z.string().max(200).nullish(),
    required: z.boolean().default(true),
  })
  .refine((f) => f.x + f.w <= 100.5 && f.y + f.h <= 100.5, "hors de la page");

export type RequestField = z.infer<typeof requestFieldSchema>;

export const signerInputSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    email: z.email().max(320).optional().or(z.literal("").transform(() => undefined)),
    phone: z.string().trim().max(30).optional().or(z.literal("").transform(() => undefined)),
  })
  .refine((s) => Boolean(s.email || s.phone), { message: "contact_required", path: ["email"] });

export type SignerInput = z.infer<typeof signerInputSchema>;

/** Couleurs des signataires (zones et pastilles), dans l'ordre. */
export const SIGNER_COLORS = ["#6366F1", "#0EA5E9", "#F59E0B", "#10B981", "#EC4899", "#8B5CF6", "#EF4444", "#14B8A6", "#84CC16", "#F97316"];

/** Types que le signataire doit remplir lui-même (les autres sont automatiques). */
export const SIGNER_INPUT_TYPES: readonly RequestFieldType[] = ["signature", "initials", "text", "checkbox"];
