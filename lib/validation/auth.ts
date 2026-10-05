import { z } from "zod";
import { meetsPasswordPolicy } from "@/lib/password";
import { toE164, type CountryCode } from "@/lib/phone";

/** Les messages d'erreur sont des clés du namespace « validation » (traduites à l'affichage). */

export const ACCOUNT_TYPES = [
  "individual",
  "company",
  "firm",
  "school",
  "ngo",
  "administration",
] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

const email = z.string().trim().toLowerCase().max(254, "tooLong").pipe(z.email("email"));
const password = z.string().max(72, "tooLong").refine(meetsPasswordPolicy, "passwordPolicy");

export const accountStepSchema = z.object({
  fullName: z.string().trim().min(2, "tooShort").max(120, "tooLong"),
  email,
  country: z.string().length(2),
  /** Facultatif : sert aux rappels WhatsApp et à présélectionner le pays de paiement. */
  phone: z.string().trim().max(30, "tooLong"),
  /** Fuseau de l'appareil (dates des signatures et des e-mails). */
  timezone: z.string().max(64).optional(),
  password,
  acceptTerms: z.literal(true, "acceptTerms"),
});

export const profileStepSchema = z.object({
  accountType: z.enum(ACCOUNT_TYPES).optional(),
  orgName: z.string().trim().max(160, "tooLong").optional(),
  orgSector: z.string().trim().max(80, "tooLong").optional(),
  city: z.string().trim().max(80, "tooLong").optional(),
});

/** Numéro vide (facultatif) ou valide pour le pays choisi. */
export function phoneOk(phone: string, country: string): boolean {
  return !phone.trim() || toE164(phone, country as CountryCode) !== null;
}

/** Fuseau horaire IANA reconnu (sinon UTC à l'enregistrement). */
export function validTimezone(timezone: string | undefined): string | null {
  if (!timezone) return null;
  try {
    new Intl.DateTimeFormat("en", { timeZone: timezone });
    return timezone;
  } catch {
    return null;
  }
}

/** Schéma complet envoyé au serveur ; le téléphone (s'il est donné) est normalisé en E.164. */
export const signUpSchema = accountStepSchema
  .extend(profileStepSchema.shape)
  .transform((data, ctx) => {
    if (!data.phone) return { ...data, phone: null, timezone: validTimezone(data.timezone) };
    const e164 = toE164(data.phone, data.country as CountryCode);
    if (!e164) {
      ctx.addIssue({ code: "custom", path: ["phone"], message: "phone" });
      return z.NEVER;
    }
    return { ...data, phone: e164, timezone: validTimezone(data.timezone) };
  });

export type AccountStepInput = z.input<typeof accountStepSchema>;
export type ProfileStepInput = z.input<typeof profileStepSchema>;
export type SignUpInput = z.input<typeof signUpSchema>;

export const signInSchema = z.object({
  email,
  password: z.string().min(1, "required").max(72, "tooLong"),
});
export type SignInInput = z.input<typeof signInSchema>;

export const forgotPasswordSchema = z.object({ email });
export type ForgotPasswordInput = z.input<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z
  .object({ password, confirm: z.string() })
  .refine((d) => d.password === d.confirm, { path: ["confirm"], message: "passwordMismatch" });
export type ResetPasswordInput = z.input<typeof resetPasswordSchema>;

/** Chemin de redirection interne sûr (évite les redirections ouvertes vers un autre site). */
export function safeNextPath(value: string | null | undefined, fallback = "/app"): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\"))
    return fallback;
  return value;
}
