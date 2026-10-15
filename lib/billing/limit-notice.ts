import "server-only";
import { after } from "next/server";
import { toLocale } from "@/i18n/config";
import type { Account } from "@/lib/auth/account";
import { sendEmail } from "@/lib/email/send";
import { limitReachedEmail } from "@/lib/email/templates";
import type { DenialReason, QuotaKind } from "@/lib/entitlements";
import { formatMoney } from "@/lib/format";
import { getPrices } from "@/lib/pricing";
import { createAdminClient } from "@/lib/supabase/admin";

export type LimitOffer = "subscribe" | "upgrade";

/**
 * Offre à proposer quand une action est refusée, ou null si aucun e-mail n'est utile :
 * - accès gratuit ou abonnement échu (fonction payante ou quota gratuit) : s'abonner ;
 * - Essentiel actif (fonction Pro ou quota Essentiel) : passer au Pro ;
 * - Pro : aucune offre supérieure, pas d'e-mail.
 */
export function limitOffer(account: Account, reason: DenialReason): LimitOffer | null {
  const ent = account.entitlements;
  const paid = ent.state !== "free";
  if (!paid) return reason === "read_only" || reason === "quota_exceeded" ? "subscribe" : null;
  if (ent.effectivePlan === "essential") {
    return reason === "feature_not_in_plan" || reason === "quota_exceeded" ? "upgrade" : null;
  }
  return null;
}

/** Semaine ISO (« 2026-W42 ») : au plus un e-mail de limite par semaine et par personne. */
export function isoWeek(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((d.getTime() - yearStart) / 86_400_000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/**
 * Programme, après la réponse (sans ralentir l'action refusée), l'e-mail « limite atteinte ».
 * Envoyé automatiquement, au plus une fois par semaine (billing_notices), seulement si le
 * compte accepte les e-mails. Hors de l'application : le lien mène au paiement sur le site.
 */
export function scheduleLimitNotice(
  account: Account,
  reason: DenialReason,
  quota?: QuotaKind,
): void {
  const offer = limitOffer(account, reason);
  if (!offer) return;
  try {
    after(() => sendLimitNotice(account.userId, offer, quota).catch(() => undefined));
  } catch {
    // Hors d'une requête (tests, scripts) : pas d'envoi différé.
  }
}

export async function sendLimitNotice(
  userId: string,
  offer: LimitOffer,
  quota?: QuotaKind,
  now = new Date(),
): Promise<boolean> {
  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("email, full_name, locale, email_notifications")
    .eq("id", userId)
    .single();
  if (!profile?.email || profile.email_notifications === false) return false;

  // Réservation idempotente : une seule ligne par personne et par semaine.
  const { error } = await admin
    .from("billing_notices")
    .insert({ user_id: userId, kind: "limit_reached", reference: isoWeek(now) });
  if (error) {
    if (error.code !== "23505") console.error("[billing] e-mail de limite", error.code);
    return false;
  }

  const locale = toLocale(profile.locale);
  const prices = await getPrices();
  const from = offer === "upgrade" ? prices.pro.XAF.monthly : prices.essential.XAF.monthly;
  await sendEmail({
    to: profile.email,
    ...limitReachedEmail({
      fullName: profile.full_name,
      offer,
      quota: quota ?? null,
      price: formatMoney(from, "XAF", locale),
      locale,
    }),
  });
  return true;
}
