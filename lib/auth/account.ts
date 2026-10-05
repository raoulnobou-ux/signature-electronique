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
  /** Plan Pro fourni par le propriétaire de l'équipe (membres d'une équipe). */
  sponsor: { teamId: string; teamName: string } | null;
};

const EMPTY_USAGE: UsageSnapshot = {
  documentsSignedThisMonth: 0,
  aiMessagesToday: 0,
  signatureAssetsCount: 0,
  storageBytesUsed: 0,
  documentsStored: 0,
};

function toUsage(value: unknown): UsageSnapshot {
  const v = (value ?? {}) as Partial<Record<keyof UsageSnapshot, unknown>>;
  const n = (x: unknown) => (typeof x === "number" ? x : Number(x ?? 0)) || 0;
  return {
    documentsSignedThisMonth: n(v.documentsSignedThisMonth),
    aiMessagesToday: n(v.aiMessagesToday),
    signatureAssetsCount: n(v.signatureAssetsCount),
    storageBytesUsed: n(v.storageBytesUsed),
    documentsStored: n(v.documentsStored),
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
  // 2FA activée mais code pas encore saisi : aucune donnée (la base refuse aussi, cf. RLS).
  if (await mfaPending(supabase, user)) return null;

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
  // Limites et quotas de chaque plan, et de l'accès gratuit (ligne « free »), dans plans_config.
  const limits: Partial<Record<PaidPlan | "free", PlanLimits>> = {};
  for (const row of limitsRes.data ?? []) {
    if (isPaidPlan(row.plan) || row.plan === "free")
      limits[row.plan] = row.limits as unknown as PlanLimits;
  }
  const usage = usageRes.error ? EMPTY_USAGE : toUsage(usageRes.data);

  let sponsor: Account["sponsor"] = null;
  let entitlements = getEntitlements({
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

  // Membre d'une équipe : le plan Pro du propriétaire s'applique s'il est plus favorable.
  if (entitlements.effectivePlan !== "pro") {
    const { data: sponsorRows } = await supabase.rpc("my_team_sponsor");
    const sp = sponsorRows?.[0];
    if (sp && (sp.plan === "pro" || sp.plan === "trial")) {
      const viaTeam = getEntitlements({
        subscription: {
          plan: sp.plan as PlanId,
          status: sp.status as SubscriptionStatus,
          currentPeriodEnd: new Date(sp.current_period_end),
          cancelAtPeriodEnd: sp.cancel_at_period_end,
          scheduledPlan: isPaidPlan(sp.scheduled_plan) ? sp.scheduled_plan : null,
          scheduledPlanAt: sp.scheduled_plan_at ? new Date(sp.scheduled_plan_at) : null,
        },
        usage,
        limits,
      });
      if (viaTeam.effectivePlan === "pro") {
        entitlements = {
          ...viaTeam,
          state: viaTeam.state === "trial" ? "active" : viaTeam.state,
          trialDaysRemaining: null,
        };
        sponsor = { teamId: sp.team_id, teamName: sp.team_name };
      }
    }
  }

  return {
    userId: user.id,
    email: user.email ?? profileRes.data.email,
    emailConfirmed: Boolean(user.email_confirmed_at),
    profile: profileRes.data,
    entitlements,
    usage,
    sponsor,
  };
});

/** Pour les pages de l'application : redirige vers la connexion si nécessaire. */
export async function requireAccount(): Promise<Account> {
  const account = await getCurrentAccount();
  if (!account) {
    if (await mfaPending(await createClient())) redirect("/connexion/verification");
    redirect("/connexion");
  }
  return account;
}

/**
 * Vrai si le compte a une 2FA active et que la session n'a pas encore été vérifiée (aal1).
 * Le jeton lu ici a déjà été validé par getUser() ; la base revérifie tout (RLS).
 */
export async function mfaPending(
  supabase: Awaited<ReturnType<typeof createClient>>,
  knownUser?: { factors?: { status: string }[] } | null,
): Promise<boolean> {
  const user = knownUser === undefined ? (await supabase.auth.getUser()).data.user : knownUser;
  if (!user?.factors?.some((f) => f.status === "verified")) return false;
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const payload = session?.access_token.split(".")[1];
  if (!payload) return true;
  const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { aal?: string };
  return claims.aal !== "aal2";
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
