import "server-only";
import { z } from "zod";

/**
 * Variables secrètes, lues uniquement côté serveur. Les intégrations optionnelles
 * (IA, paiement, e-mail, conversion Word) peuvent être absentes en développement :
 * les fonctionnalités concernées affichent alors un message clair au lieu de planter.
 */
/**
 * Environnement d'un prestataire (« sandbox » ou « production »), insensible à la casse ;
 * une valeur inconnue est ignorée (production) au lieu de bloquer toute la configuration.
 */
const providerEnv = z.preprocess(
  (value) => (typeof value === "string" ? value.toLowerCase() : value),
  z.enum(["sandbox", "production"]).optional().catch(undefined),
);

const serverSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
  ANTHROPIC_API_KEY: z.string().optional(),
  /** Espace de travail Anthropic, requis si la clé n'est rattachée à aucun espace de travail. */
  ANTHROPIC_WORKSPACE_ID: z.string().optional(),
  /** "true" : assistant simulé sans clé Anthropic (dev, tests e2e). Ignoré en production Vercel. */
  AI_MOCK: z.enum(["true", "false"]).optional(),
  GOTENBERG_URL: z.url().optional(),
  GOTENBERG_TOKEN: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().default("QuickSign <bonjour@quicksign.app>"),
  /** pawaPay (Mobile Money, FCFA) : jeton d'API. */
  PAWAPAY_API_TOKEN: z.string().optional(),
  PAWAPAY_ENV: providerEnv,
  /** Pays proposés pour le Mobile Money (ex. « CMR,GAB,CIV ») ; vide = configuration pawaPay. */
  PAWAPAY_COUNTRIES: z.string().optional(),
  /** Adresse de l'API pawaPay de test (https://api.sandbox.pawapay.io par défaut). */
  PAWAPAY_API_SANDBOX_URL: z.string().optional(),
  /** Paddle (carte, international, dollars) : clé d'API serveur. */
  PADDLE_API_KEY: z.string().optional(),
  /** Clé secrète de la destination de notification Paddle (en-tête Paddle-Signature). */
  PADDLE_WEBHOOK_SECRET: z.string().optional(),
  PADDLE_ENV: providerEnv,
  /** Jeton côté client de Paddle.js (public, commence par test_ ou live_). */
  PADDLE_CLIENT_TOKEN: z.string().optional(),
  /** "true" : paiements simulés sans prestataire (dev, tests). Ignoré en production Vercel. */
  PAYMENTS_SANDBOX: z.enum(["true", "false"]).optional(),
  VERCEL_ENV: z.string().optional(),
  /** Secret des liens de signature (sinon dérivé de la clé service Supabase). */
  LINK_SECRET: z.string().min(32).optional(),
  SENTRY_DSN: z.string().optional(),
  CRON_SECRET: z.string().optional(),
});

/** Valeurs collées dans un tableau de bord : espaces et retours à la ligne parasites retirés. */
const emptyToUndefined = (value: string | undefined) => {
  // Guillemets englobants et préfixe « Bearer » collés par erreur avec un jeton.
  const trimmed = value
    ?.trim()
    .replace(/^(["'])(.*)\1$/s, "$2")
    .replace(/^Bearer\s+/i, "")
    .trim();
  return trimmed === "" ? undefined : trimmed;
};

type ServerEnv = z.infer<typeof serverSchema>;

/**
 * Noms acceptés en plus du nom officiel : une variable secrète Vercel ne peut pas être
 * renommée, et une clé Anthropic ne s'affiche qu'une fois à sa création.
 */
const ALIASES: Partial<Record<keyof typeof serverSchema.shape, string>> = {
  ANTHROPIC_API_KEY: "ANTROPIC_API_KEY",
};

/**
 * Remplacements prioritaires : une nouvelle valeur enregistrée sous un second nom
 * (« …2 ») l'emporte sur l'ancienne, impossible à modifier sans la ressaisir.
 */
const REPLACEMENTS: Partial<Record<keyof typeof serverSchema.shape, string>> = {
  PAWAPAY_API_TOKEN: "PAWAPAY_API_TOKEN2",
};

const parsed = serverSchema.safeParse(
  Object.fromEntries(
    Object.keys(serverSchema.shape).map((key) => {
      const alias = ALIASES[key as keyof typeof ALIASES];
      const replacement = REPLACEMENTS[key as keyof typeof REPLACEMENTS];
      const value =
        (replacement ? emptyToUndefined(process.env[replacement]) : undefined) ??
        emptyToUndefined(process.env[key]) ??
        (alias ? emptyToUndefined(process.env[alias]) : undefined);
      return [key, value];
    }),
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
