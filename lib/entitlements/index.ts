import {
  DEFAULT_LIMITS,
  FEATURES,
  FREE_FEATURES,
  FREE_LIMITS,
  GRACE_PERIOD_DAYS,
  PLAN_FEATURES,
  type Feature,
  type PaidPlan,
  type PlanId,
  type PlanLimits,
  type SubscriptionStatus,
} from "./plans";

export * from "./plans";

const DAY_MS = 24 * 60 * 60 * 1000;

export interface SubscriptionSnapshot {
  plan: PlanId;
  status: SubscriptionStatus;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
  /** Changement de plan programmé (renouvellement payé d'avance avec un autre plan, rétrogradation). */
  scheduledPlan: PaidPlan | null;
  /** Date d'effet du changement programmé. */
  scheduledPlanAt?: Date | null;
}

export interface UsageSnapshot {
  documentsSignedThisMonth: number;
  aiMessagesToday: number;
  signatureAssetsCount: number;
  storageBytesUsed: number;
  /** Documents conservés (hors corbeille). */
  documentsStored: number;
}

/**
 * État d'accès du compte :
 * - free    : accès gratuit limité (découverte, un document) : sans abonnement, essai
 *             terminé ou abonnement échu. Les documents existants restent consultables.
 * - trial   : ancien essai de 6 jours encore en cours (comptes existants, fonctions Pro)
 * - active  : abonnement payé en cours
 * - grace   : période payée terminée, renouvellement attendu (accès maintenu 3 jours)
 */
export type AccessState = "free" | "trial" | "active" | "grace";

export interface Entitlements {
  state: AccessState;
  /** Plan payant dont les droits s'appliquent maintenant (Pro pendant l'essai), null en gratuit. */
  effectivePlan: PaidPlan | null;
  /** Plan enregistré sur l'abonnement. */
  subscriptionPlan: PlanId;
  /** Sans abonnement : signature, export et fonctions payantes fermés (accès gratuit). */
  readOnly: boolean;
  features: Record<Feature, boolean>;
  limits: PlanLimits;
  /** Quotas restants : null = illimité. */
  remaining: {
    documentsStored: number | null;
    documentsThisMonth: number | null;
    aiMessagesToday: number | null;
    signatureAssets: number | null;
    storageBytes: number;
  };
  /** Jours d'essai restants (arrondi supérieur), null hors essai. */
  trialDaysRemaining: number | null;
  periodEndsAt: Date;
  /** Fin de la période de grâce, si le compte y est. */
  graceEndsAt: Date | null;
  cancelAtPeriodEnd: boolean;
  scheduledPlan: PaidPlan | null;
  scheduledPlanAt: Date | null;
}

export interface GetEntitlementsInput {
  subscription: SubscriptionSnapshot;
  usage: UsageSnapshot;
  /** Limites lues dans plans_config ; repli sur DEFAULT_LIMITS et FREE_LIMITS. */
  limits?: Partial<Record<PaidPlan | "free", PlanLimits>>;
  now?: Date;
}

function resolveState(sub: SubscriptionSnapshot, now: Date): AccessState {
  const end = sub.currentPeriodEnd.getTime();
  const t = now.getTime();
  const graceEnd = end + GRACE_PERIOD_DAYS * DAY_MS;

  switch (sub.status) {
    case "trialing":
      return t < end ? "trial" : "free";
    case "active":
    case "past_due":
      if (t < end) return "active";
      // Annulé : l'accès payant s'arrête à la fin de la période payée, sans grâce.
      if (sub.cancelAtPeriodEnd) return "free";
      // Renouvellement non encore reçu (Mobile Money sans prélèvement automatique).
      return t < graceEnd ? "grace" : "free";
    case "canceled":
      // Annulation effective à la fin de la période déjà payée, sans période de grâce.
      return t < end ? "active" : "free";
    case "free":
    case "expired":
      return "free";
  }
}

function remainingOf(limit: number | null, used: number): number | null {
  return limit === null ? null : Math.max(0, limit - used);
}

/**
 * Fonction centrale des droits : plan effectif, fonctionnalités, quotas restants,
 * jours d'essai restants. Pure et déterministe (horloge injectable) pour être testée.
 */
export function getEntitlements({
  subscription,
  usage,
  limits,
  now = new Date(),
}: GetEntitlementsInput): Entitlements {
  const state = resolveState(subscription, now);

  let effectivePlan: PaidPlan | null = null;
  if (state === "trial") effectivePlan = "pro";
  else if (state !== "free") {
    const switched =
      subscription.scheduledPlan !== null &&
      subscription.scheduledPlanAt != null &&
      now.getTime() >= subscription.scheduledPlanAt.getTime();
    // Un paiement pendant l'essai garde l'essai Pro jusqu'à sa fin (plan « trial » + bascule programmée).
    effectivePlan = switched
      ? subscription.scheduledPlan
      : subscription.plan === "trial"
        ? "pro"
        : subscription.plan === "free"
          ? null
          : subscription.plan;
  }

  const readOnly = effectivePlan === null;
  const planLimits: PlanLimits = effectivePlan
    ? (limits?.[effectivePlan] ?? DEFAULT_LIMITS[effectivePlan])
    : { ...FREE_LIMITS, ...limits?.free };
  const allowed = new Set<Feature>(effectivePlan ? PLAN_FEATURES[effectivePlan] : FREE_FEATURES);
  const features = Object.fromEntries(FEATURES.map((f) => [f, allowed.has(f)])) as Record<
    Feature,
    boolean
  >;

  const periodEnd = subscription.currentPeriodEnd;
  const trialDaysRemaining =
    subscription.status === "trialing"
      ? Math.max(0, Math.ceil((periodEnd.getTime() - now.getTime()) / DAY_MS))
      : null;

  return {
    state,
    effectivePlan,
    subscriptionPlan: subscription.plan,
    readOnly,
    features,
    limits: planLimits,
    remaining: {
      documentsStored: remainingOf(planLimits.documentsStored ?? null, usage.documentsStored),
      documentsThisMonth: remainingOf(planLimits.documentsPerMonth, usage.documentsSignedThisMonth),
      aiMessagesToday: remainingOf(planLimits.aiMessagesPerDay, usage.aiMessagesToday),
      signatureAssets: remainingOf(planLimits.signatureAssets, usage.signatureAssetsCount),
      storageBytes: Math.max(0, planLimits.storageBytes - usage.storageBytesUsed),
    },
    trialDaysRemaining,
    periodEndsAt: periodEnd,
    graceEndsAt:
      state === "grace" ? new Date(periodEnd.getTime() + GRACE_PERIOD_DAYS * DAY_MS) : null,
    cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
    scheduledPlan: subscription.scheduledPlan,
    scheduledPlanAt: subscription.scheduledPlanAt ?? null,
  };
}

/**
 * Motif de refus, traduit dans l'interface :
 * - read_only : fonction réservée aux abonnés (compte en accès gratuit) ;
 * - feature_not_in_plan : fonction d'un plan supérieur ;
 * - quota_exceeded : limite du plan (ou de l'accès gratuit) atteinte.
 */
export type DenialReason = "read_only" | "feature_not_in_plan" | "quota_exceeded";

export type AccessCheck = { ok: true } | { ok: false; reason: DenialReason };

export type QuotaKind =
  "documentsStored" | "documentsThisMonth" | "aiMessagesToday" | "signatureAssets";

/**
 * Vérifie qu'une action est permise : fonctionnalité incluse dans le plan (ou dans
 * l'accès gratuit), et quota disponible (pour `amount` unités).
 */
export function checkAccess(
  ent: Entitlements,
  feature: Feature,
  quota?: { kind: QuotaKind; amount?: number },
): AccessCheck {
  if (!ent.features[feature])
    return { ok: false, reason: ent.readOnly ? "read_only" : "feature_not_in_plan" };
  if (quota) {
    const left = ent.remaining[quota.kind];
    if (left !== null && left < (quota.amount ?? 1)) return { ok: false, reason: "quota_exceeded" };
  }
  return { ok: true };
}
