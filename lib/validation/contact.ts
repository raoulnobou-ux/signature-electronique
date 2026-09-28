import { z } from "zod";

/** Schéma partagé client/serveur. Les messages sont des clés du namespace « validation ». */
export const contactSchema = z.object({
  name: z.string().trim().min(2, "tooShort").max(120, "tooLong"),
  email: z.email("email").max(254, "tooLong"),
  organization: z.string().trim().max(160, "tooLong").optional().or(z.literal("")),
  message: z.string().trim().min(10, "tooShort").max(5000, "tooLong"),
  /** Champ piège invisible : rempli uniquement par les robots. */
  website: z.string().max(0).optional().or(z.literal("")),
});

export type ContactInput = z.infer<typeof contactSchema>;
