import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import {
  checkAccess,
  getEntitlements,
  isPaidPlan,
  type DenialReason,
  type Entitlements,
  type Feature,
  type PaidPlan,
  type PlanId,
  type PlanLimits,
  type QuotaKind,
  type SubscriptionStatus,
  type UsageSnapshot,
} from "@/lib/entitlements";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/lib/supabase/database.types";

export type Profile = Tables<"profiles">;

export type Account = {
  userId: string;
  email: string;
  emailConfirmed: boolean;
  profile: Profile;
  entitlements: Entitlements;
  usage: UsageSnapshot;
};

const EMPTY_USAGE: UsageSnapshot = {
  documentsSignedThisMonth: 0,
  aiMessagesToday: 0,
  signatureAssetsCount: 0,
  storageBytesUsed: 0,
};

function toUsage(value: unknown): UsageSnapshot {
  const v = (value ?? {}) as Partial<Record<keyof UsageSnapshot, unknown>>;
  const n = (x: unknown) => (typeof x === "number" ? x : Number(x ?? 0)) || 0;
  return {
    documentsSignedThisMonth: n(v.documentsSignedThisMonth),
    aiMessagesToday: n(v.aiMessagesToday),
    signatureAssetsCount: n(v.signatureAssetsCount),
    storageBytesUsed: n(v.storageBytesUsed),
  };
}

/**
 * Compte de l'utilisateur connecté : profil, droits et usage.
 * Mis en cache pour la durée de la requête (plusieurs composants peuvent l'appeler).
 * `getUser()` interroge le serveur d'authentification : la session est vérifiée, pas seulement décodée.
 */
export const getCurrentAccount = cache(async (): Promise<Account | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [profileRes, subscriptionRes, usageRes, limitsRes] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).single(),
    supabase.from("subscriptions").select("*").eq("user_id", user.id).single(),
    supabase.rpc("my_usage_snapshot"),
    supabase.from("plans_config").select("plan, limits").eq("currency", "XAF"),
  ]);

  if (profileRes.error || subscriptionRes.error) {
    console.error(
      "[account] profil ou abonnement introuvable",
      profileRes.error ?? subscriptionRes.error,
    );
    return null;
  }

  const sub = subscriptionRes.data;
  const limits: Partial<Record<PaidPlan, PlanLimits>> = {};
  for (const row of limitsRes.data ?? []) {
    if (isPaidPlan(row.plan)) limits[row.plan] = row.limits as unknown as PlanLimits;
  }
  const usage = usageRes.error ? EMPTY_USAGE : toUsage(usageRes.data);

  const entitlements = getEntitlements({
    subscription: {
      plan: sub.plan as PlanId,
      status: sub.status as SubscriptionStatus,
      currentPeriodEnd: new Date(sub.current_period_end),
      cancelAtPeriodEnd: sub.cancel_at_period_end,
      scheduledPlan: isPaidPlan(sub.scheduled_plan) ? sub.scheduled_plan : null,
      scheduledPlanAt: sub.scheduled_plan_at ? new Date(sub.scheduled_plan_at) : null,
    },
    usage,
    limits,
  });

  return {
    userId: user.id,
    email: user.email ?? profileRes.data.email,
    emailConfirmed: Boolean(user.email_confirmed_at),
    profile: profileRes.data,
    entitlements,
    usage,
  };
});

/** Pour les pages de l'application : redirige vers la connexion si nécessaire. */
export async function requireAccount(): Promise<Account> {
  const account = await getCurrentAccount();
  if (!account) redirect("/connexion");
  return account;
}

export type GuardDenial = DenialReason | "unauthenticated" | "email_unverified";
export type GuardResult = { ok: true; account: Account } | { ok: false; reason: GuardDenial };

/**
 * Garde des actions protégées (côté serveur, jamais seulement dans l'interface) :
 * session valide, e-mail vérifié, droits du plan et quota.
 */
export async function guard(
  feature: Feature,
  quota?: { kind: QuotaKind; amount?: number },
): Promise<GuardResult> {
  const account = await getCurrentAccount();
  if (!account) return { ok: false, reason: "unauthenticated" };
  if (!account.emailConfirmed) return { ok: false, reason: "email_unverified" };
  const check = checkAccess(account.entitlements, feature, quota);
  return check.ok ? { ok: true, account } : { ok: false, reason: check.reason };
}
