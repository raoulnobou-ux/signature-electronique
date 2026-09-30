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
  /** "true" : assistant simulé sans clé Anthropic (dev, tests e2e). Ignoré en production Vercel. */
  AI_MOCK: z.enum(["true", "false"]).optional(),
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

type ServerEnv = z.infer<typeof serverSchema>;

const parsed = serverSchema.safeParse(
  Object.fromEntries(
    Object.keys(serverSchema.shape).map((key) => [key, emptyToUndefined(process.env[key])]),
  ),
);

/**
 * Ni le build (next build) ni les pages publiques ne dépendent des secrets : une variable
 * manquante n'est signalée, avec son nom, que lorsqu'une fonctionnalité s'en sert.
 */
function missing(error: z.ZodError): ServerEnv {
  const names = error.issues.map((issue) => issue.path.join(".")).join(", ");
  return new Proxy({} as ServerEnv, {
    get() {
      throw new Error(`Variables d'environnement serveur manquantes ou invalides : ${names}`);
    },
  });
}

if (!parsed.success && process.env.NEXT_PHASE !== "phase-production-build") {
  console.error("[env] configuration serveur incomplète", parsed.error.issues);
}

export const serverEnv: ServerEnv = parsed.success ? parsed.data : missing(parsed.error);
