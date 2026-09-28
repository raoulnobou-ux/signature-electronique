import {
  DEFAULT_LIMITS,
  FEATURES,
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
}

/**
 * État d'accès du compte :
 * - trial   : essai gratuit en cours (fonctionnalités Pro)
 * - active  : abonnement payé en cours
 * - grace   : période payée terminée, renouvellement attendu (accès maintenu 3 jours)
 * - expired : lecture seule (consultation et téléchargement uniquement)
 */
export type AccessState = "trial" | "active" | "grace" | "expired";

export interface Entitlements {
  state: AccessState;
  /** Plan dont les droits s'appliquent maintenant (Pro pendant l'essai), null si expiré. */
  effectivePlan: PaidPlan | null;
  /** Plan enregistré sur l'abonnement. */
  subscriptionPlan: PlanId;
  readOnly: boolean;
  features: Record<Feature, boolean>;
  limits: PlanLimits | null;
  /** Quotas restants : null = illimité ; 0 quand le compte est en lecture seule. */
  remaining: {
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
  /** Limites lues dans plans_config ; repli sur DEFAULT_LIMITS. */
  limits?: Partial<Record<PaidPlan, PlanLimits>>;
  now?: Date;
}

function resolveState(sub: SubscriptionSnapshot, now: Date): AccessState {
  const end = sub.currentPeriodEnd.getTime();
  const t = now.getTime();
  const graceEnd = end + GRACE_PERIOD_DAYS * DAY_MS;

  switch (sub.status) {
    case "trialing":
      return t < end ? "trial" : "expired";
    case "active":
    case "past_due":
      if (t < end) return "active";
      // Annulé : l'accès s'arrête à la fin de la période payée, sans grâce.
      if (sub.cancelAtPeriodEnd) return "expired";
      // Renouvellement non encore reçu (Mobile Money sans prélèvement automatique).
      return t < graceEnd ? "grace" : "expired";
    case "canceled":
      // Annulation effective à la fin de la période déjà payée, sans période de grâce.
      return t < end ? "active" : "expired";
    case "expired":
      return "expired";
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
  else if (state !== "expired") {
    const switched =
      subscription.scheduledPlan !== null &&
      subscription.scheduledPlanAt != null &&
      now.getTime() >= subscription.scheduledPlanAt.getTime();
    // Un paiement pendant l'essai garde l'essai Pro jusqu'à sa fin (plan « trial » + bascule programmée).
    effectivePlan = switched
      ? subscription.scheduledPlan
      : subscription.plan === "trial"
        ? "pro"
        : subscription.plan;
  }

  const readOnly = effectivePlan === null;
  const planLimits = effectivePlan
    ? (limits?.[effectivePlan] ?? DEFAULT_LIMITS[effectivePlan])
    : null;
  const allowed = new Set<Feature>(effectivePlan ? PLAN_FEATURES[effectivePlan] : []);
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
    remaining: planLimits
      ? {
          documentsThisMonth: remainingOf(
            planLimits.documentsPerMonth,
            usage.documentsSignedThisMonth,
          ),
          aiMessagesToday: remainingOf(planLimits.aiMessagesPerDay, usage.aiMessagesToday),
          signatureAssets: remainingOf(planLimits.signatureAssets, usage.signatureAssetsCount),
          storageBytes: Math.max(0, planLimits.storageBytes - usage.storageBytesUsed),
        }
      : { documentsThisMonth: 0, aiMessagesToday: 0, signatureAssets: 0, storageBytes: 0 },
    trialDaysRemaining,
    periodEndsAt: periodEnd,
    graceEndsAt:
      state === "grace" ? new Date(periodEnd.getTime() + GRACE_PERIOD_DAYS * DAY_MS) : null,
    cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
    scheduledPlan: subscription.scheduledPlan,
    scheduledPlanAt: subscription.scheduledPlanAt ?? null,
  };
}

/** Motif de refus, traduit dans l'interface. */
export type DenialReason = "read_only" | "feature_not_in_plan" | "quota_exceeded";

export type AccessCheck = { ok: true } | { ok: false; reason: DenialReason };

export type QuotaKind = "documentsThisMonth" | "aiMessagesToday" | "signatureAssets";

/**
 * Vérifie qu'une action est permise : compte non expiré, fonctionnalité incluse
 * dans le plan, et quota disponible (pour `amount` unités).
 */
export function checkAccess(
  ent: Entitlements,
  feature: Feature,
  quota?: { kind: QuotaKind; amount?: number },
): AccessCheck {
  if (ent.readOnly) return { ok: false, reason: "read_only" };
  if (!ent.features[feature]) return { ok: false, reason: "feature_not_in_plan" };
  if (quota) {
    const left = ent.remaining[quota.kind];
    if (left !== null && left < (quota.amount ?? 1)) return { ok: false, reason: "quota_exceeded" };
  }
  return { ok: true };
}
