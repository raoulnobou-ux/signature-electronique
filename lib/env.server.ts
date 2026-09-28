import "server-only";
import { z } from "zod";

/**
 * Variables secrètes, lues uniquement côté serveur. Les intégrations optionnelles
 * (IA, paiement, e-mail, conversion Word) peuvent être absentes en développement :
 * les fonctionnalités concernées affichent alors un message clair au lieu de planter.
 */
const serverSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
  ANTHROPIC_API_KEY: z.string().optional(),
  GOTENBERG_URL: z.url().optional(),
  GOTENBERG_TOKEN: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().default("QuickSign <bonjour@quicksign.app>"),
  CINETPAY_API_KEY: z.string().optional(),
  CINETPAY_SITE_ID: z.string().optional(),
  /** Clé secrète : authentifie les notifications (en-tête x-token). */
  CINETPAY_SECRET_KEY: z.string().optional(),
  /** "true" : paiements simulés sans clé CinetPay (dev, tests). Ignoré en production Vercel. */
  PAYMENTS_SANDBOX: z.enum(["true", "false"]).optional(),
  VERCEL_ENV: z.string().optional(),
  /** Secret des liens de signature (sinon dérivé de la clé service Supabase). */
  LINK_SECRET: z.string().min(32).optional(),
  SENTRY_DSN: z.string().optional(),
  CRON_SECRET: z.string().optional(),
});

const emptyToUndefined = (value: string | undefined) => (value === "" ? undefined : value);

export const serverEnv = serverSchema.parse(
  Object.fromEntries(
    Object.keys(serverSchema.shape).map((key) => [key, emptyToUndefined(process.env[key])]),
  ),
);
