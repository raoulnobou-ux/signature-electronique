/** Catalogue des plans : fonctionnalités et limites par défaut (repli si plans_config est indisponible). */

export type PaidPlan = "essential" | "pro";
/** « free » : accès gratuit limité ; « trial » : ancien essai de 6 jours (comptes existants). */
export type PlanId = "free" | "trial" | PaidPlan;
export type SubscriptionStatus =
  "free" | "trialing" | "active" | "past_due" | "canceled" | "expired";
export type BillingCycle = "monthly" | "yearly";
export type { Currency } from "@/config/currencies";
import type { Currency } from "@/config/currencies";

/** Durée de l'ancien essai (comptes créés avant l'accès gratuit, honorés jusqu'à leur fin). */
export const TRIAL_DAYS = 6;
/** Jours pendant lesquels l'accès reste ouvert après la fin d'une période payée non renouvelée. */
export const GRACE_PERIOD_DAYS = 3;

export const FEATURES = [
  "sign", // signer et exporter ses documents
  "upload", // importer des documents
  "edit", // ouvrir l'éditeur, placer des champs, créer sa signature (découverte)
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
  /** Documents conservés (hors corbeille) ; null = illimité. */
  documentsStored?: number | null;
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

/**
 * Accès gratuit (sans abonnement) : découverte de l'application avec un document.
 * Repli si la ligne « free » de plans_config est indisponible.
 */
export const FREE_LIMITS: PlanLimits = {
  documentsPerMonth: 0,
  signatureAssets: 1,
  storageBytes: 20 * 1024 ** 2,
  aiMessagesPerDay: 5,
  teamMembers: 1,
  documentsStored: 1,
};

export const FREE_FEATURES: readonly Feature[] = ["upload", "edit", "ai_assistant"];

export const PLAN_FEATURES: Record<PaidPlan, readonly Feature[]> = {
  essential: ["sign", "upload", "edit", "ai_assistant"],
  pro: FEATURES,
};

/**
 * Prix par défaut, par marché (unités entières de chaque devise ; annuel = 10 mois).
 * La source de vérité est la table plans_config : ces valeurs ne servent que de repli.
 */
export const DEFAULT_PRICES: Record<PaidPlan, Record<Currency, Record<BillingCycle, number>>> = {
  essential: {
    XAF: { monthly: 5000, yearly: 50000 },
    EUR: { monthly: 9, yearly: 90 },
    USD: { monthly: 10, yearly: 100 },
    GBP: { monthly: 8, yearly: 80 },
  },
  pro: {
    XAF: { monthly: 15000, yearly: 150000 },
    EUR: { monthly: 25, yearly: 250 },
    USD: { monthly: 29, yearly: 290 },
    GBP: { monthly: 22, yearly: 220 },
  },
};

/** Garde de type pour les valeurs lues en base (colonnes texte contraintes par CHECK). */
export function isPaidPlan(value: unknown): value is PaidPlan {
  return value === "essential" || value === "pro";
}
