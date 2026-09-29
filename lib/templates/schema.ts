import { z } from "zod";
import { MAX_SIGNERS, REQUEST_FIELD_TYPES } from "@/lib/requests/fields";

/**
 * Zones d'un modèle : comme une demande, mais attribuées à des RÔLES (« Client »,
 * « Bailleur »…). Une zone texte « variable » est remplie par l'expéditeur à chaque
 * utilisation (nom du client, montant…) et apposée sur la copie du document.
 */
export const templateFieldSchema = z
  .object({
    id: z.string().min(1).max(64),
    signer: z.number().int().min(0).max(MAX_SIGNERS - 1),
    page: z.number().int().min(0).max(4999),
    x: z.number().min(0).max(100),
    y: z.number().min(0).max(100),
    w: z.number().min(0.5).max(100),
    h: z.number().min(0.3).max(100),
    type: z.enum(REQUEST_FIELD_TYPES),
    value: z.string().max(200).nullish(),
    required: z.boolean().default(true),
    variable: z.boolean().default(false),
  })
  .refine((f) => f.x + f.w <= 100.5 && f.y + f.h <= 100.5, "hors de la page")
  .refine((f) => !f.variable || f.type === "text", "seules les zones texte peuvent être variables");

export type TemplateField = z.infer<typeof templateFieldSchema>;

export const templateRoleSchema = z.object({ label: z.string().trim().min(2).max(60) });
export type TemplateRole = z.infer<typeof templateRoleSchema>;
