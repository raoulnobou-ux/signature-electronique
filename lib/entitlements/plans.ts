/** Catalogue des plans : fonctionnalités et limites par défaut (repli si plans_config est indisponible). */

export type PaidPlan = "essential" | "pro";
export type PlanId = "trial" | PaidPlan;
export type SubscriptionStatus = "trialing" | "active" | "past_due" | "canceled" | "expired";
export type BillingCycle = "monthly" | "yearly";
export type Currency = "XAF" | "USD";

export const TRIAL_DAYS = 6;
/** Jours pendant lesquels l'accès reste ouvert après la fin d'une période payée non renouvelée. */
export const GRACE_PERIOD_DAYS = 3;

export const FEATURES = [
  "sign", // signer ses documents
  "upload", // importer des documents
  "ai_assistant", // assistant IA (aide à l'utilisation)
  "ai_advanced", // outils IA avancés (analyse, zones, rédaction…)
  "stamps", // cachets d'entreprise
  "multi_signers", // demandes de signature à plusieurs personnes
  "audit_trail", // traçabilité complète + certificat de preuve
  "templates", // modèles réutilisables
  "share_links", // envoi de liens de signature (WhatsApp, e-mail)
  "bulk_sign", // signature en lot
  "team", // espace d'équipe
  "priority_support",
] as const;

export type Feature = (typeof FEATURES)[number];

export interface PlanLimits {
  /** null = illimité */
  documentsPerMonth: number | null;
  signatureAssets: number | null;
  storageBytes: number;
  aiMessagesPerDay: number | null;
  teamMembers: number;
}

const GB = 1024 ** 3;

export const DEFAULT_LIMITS: Record<PaidPlan, PlanLimits> = {
  essential: {
    documentsPerMonth: 50,
    signatureAssets: 5,
    storageBytes: 1 * GB,
    aiMessagesPerDay: 20,
    teamMembers: 1,
  },
  pro: {
    documentsPerMonth: null,
    signatureAssets: null,
    storageBytes: 20 * GB,
    aiMessagesPerDay: null,
    teamMembers: 5,
  },
};

export const PLAN_FEATURES: Record<PaidPlan, readonly Feature[]> = {
  essential: ["sign", "upload", "ai_assistant"],
  pro: FEATURES,
};

/** Prix par défaut (FCFA et dollars entiers). La source de vérité est la table plans_config. */
export const DEFAULT_PRICES: Record<PaidPlan, Record<Currency, Record<BillingCycle, number>>> = {
  essential: { XAF: { monthly: 5000, yearly: 50000 }, USD: { monthly: 9, yearly: 90 } },
  pro: { XAF: { monthly: 15000, yearly: 150000 }, USD: { monthly: 26, yearly: 260 } },
};

/** Garde de type pour les valeurs lues en base (colonnes texte contraintes par CHECK). */
export function isPaidPlan(value: unknown): value is PaidPlan {
  return value === "essential" || value === "pro";
}
