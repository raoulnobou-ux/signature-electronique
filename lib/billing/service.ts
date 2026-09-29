import "server-only";
import { recordAudit } from "@/lib/audit";
import { sendEmail } from "@/lib/email/send";
import {
  graceStartedEmail,
  paymentFailedEmail,
  paymentSucceededEmail,
  renewalReminderEmail,
  subscriptionExpiredEmail,
  trialEndedEmail,
  trialEndingEmail,
  planName,
} from "@/lib/email/templates";
import {
  GRACE_PERIOD_DAYS,
  isPaidPlan,
  type BillingCycle,
  type Currency,
  type PaidPlan,
} from "@/lib/entitlements/plans";
import { formatLongDate, formatMoney } from "@/lib/format";
import { toLocale, type Locale } from "@/i18n/config";
import { siteConfig } from "@/lib/site";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPaymentProvider } from ".";
import { paymentMethodLabel, renderReceipt } from "./receipt";

const DAY = 24 * 60 * 60 * 1000;

export const PLAN_LABELS: Record<PaidPlan, string> = { essential: "Essentiel", pro: "Pro" };
export const CYCLE_LABELS: Record<BillingCycle, string> = { monthly: "mensuel", yearly: "annuel" };

export function paymentDescription(plan: PaidPlan, cycle: BillingCycle, kind: string): string {
  const base = `Abonnement ${PLAN_LABELS[plan]} — ${CYCLE_LABELS[cycle]}`;
  return kind === "upgrade" ? `${base} (passage au Pro, au prorata)` : base;
}

type Admin = ReturnType<typeof createAdminClient>;

async function profileOf(admin: Admin, userId: string) {
  const { data } = await admin
    .from("profiles")
    .select("email, full_name, org_name, locale")
    .eq("id", userId)
    .single();
  return data;
}

/** Réserve une notification ; false si elle a déjà été envoyée (idempotence des rappels). */
async function claimNotice(
  admin: Admin,
  userId: string,
  kind: string,
  reference: string,
): Promise<boolean> {
  const { error } = await admin
    .from("billing_notices")
    .insert({ user_id: userId, kind, reference });
  if (!error) return true;
  if (error.code !== "23505") console.error("[billing] notice", kind, error);
  return false;
}

async function notify(
  admin: Admin,
  userId: string,
  kind: string,
  reference: string,
  build: (profile: { email: string; full_name: string; locale: Locale }) => {
    subject: string;
    html: string;
    text: string;
  },
): Promise<boolean> {
  const profile = await profileOf(admin, userId);
  if (!profile?.email) return false;
  if (!(await claimNotice(admin, userId, kind, reference))) return false;
  await sendEmail({
    to: profile.email,
    ...build({ ...profile, locale: toLocale(profile.locale) }),
  });
  return true;
}

/**
 * Génère (ou régénère) le reçu PDF numéroté d'un paiement réussi, le range dans le
 * bucket privé `receipts` et, à la première émission, l'envoie par e-mail.
 */
export async function issueReceipt(
  paymentId: string,
  { email }: { email: boolean },
): Promise<void> {
  const admin = createAdminClient();
  const { data: payment } = await admin.from("payments").select("*").eq("id", paymentId).single();
  if (!payment || payment.status !== "successful" || !payment.receipt_number) return;
  if (payment.receipt_path && !email) return;
  if (!isPaidPlan(payment.plan)) return;

  const profile = await profileOf(admin, payment.user_id);
  const currency = payment.currency as Currency;
  const cycle = payment.billing_cycle as BillingCycle;
  const bytes = await renderReceipt({
    number: payment.receipt_number,
    paidAt: new Date(payment.paid_at ?? payment.updated_at),
    customer: {
      name: profile?.full_name ?? "",
      email: profile?.email ?? "",
      organization: profile?.org_name ?? null,
    },
    description: paymentDescription(payment.plan, cycle, payment.kind),
    periodStart: new Date(payment.period_start ?? payment.updated_at),
    periodEnd: new Date(payment.period_end ?? payment.updated_at),
    amount: Number(payment.amount),
    currency,
    method: paymentMethodLabel(payment.payment_method),
    reference: payment.provider_ref,
    transactionId: payment.provider_tx_id ?? "—",
    seller: { name: siteConfig.name, url: siteConfig.url, email: siteConfig.supportEmail },
  });

  const path = `${payment.user_id}/${payment.receipt_number}.pdf`;
  const { error: uploadError } = await admin.storage
    .from("receipts")
    .upload(path, bytes, { contentType: "application/pdf", upsert: true });
  if (uploadError) {
    console.error("[billing] reçu non enregistré", uploadError);
    return;
  }
  await admin.from("payments").update({ receipt_path: path }).eq("id", payment.id);

  if (email && profile?.email) {
    const locale = toLocale(profile.locale);
    const message = paymentSucceededEmail({
      fullName: profile.full_name,
      planLabel: planName(payment.plan, locale),
      amount: formatMoney(Number(payment.amount), currency, locale),
      periodEnd: formatLongDate(new Date(payment.period_end ?? Date.now()), locale),
      receiptNumber: payment.receipt_number,
      locale,
    });
    await sendEmail({
      to: profile.email,
      ...message,
      attachments: [
        {
          filename: `Recu-${payment.receipt_number}.pdf`,
          content: Buffer.from(bytes).toString("base64"),
        },
      ],
    });
  }
}

export type SettleOutcome = "successful" | "failed" | "pending" | "unknown";

/**
 * Règle un paiement à partir de sa référence : la transaction est TOUJOURS revérifiée
 * auprès du prestataire (statut, référence, montant, devise) avant d'activer quoi que ce
 * soit. Appelé par le webhook et par la page de retour ; idempotent.
 */
export async function settlePayment(input: {
  reference: string;
  transactionId: string | null;
}): Promise<{ outcome: SettleOutcome; userId?: string }> {
  const provider = getPaymentProvider();
  if (!provider) return { outcome: "unknown" };
  const admin = createAdminClient();
  const { data: payment } = await admin
    .from("payments")
    .select("*")
    .eq("provider_ref", input.reference)
    .maybeSingle();
  if (!payment) return { outcome: "unknown" };
  const userId = payment.user_id;

  if (payment.status === "successful") {
    await issueReceipt(payment.id, { email: false });
    return { outcome: "successful", userId };
  }
  if (payment.provider !== provider.name) return { outcome: "unknown", userId };

  const expected = { amount: Number(payment.amount), currency: payment.currency as Currency };
  const tx = await provider.verifyTransaction({
    reference: payment.provider_ref,
    transactionId: input.transactionId,
    expected,
  });
  if (!tx) return { outcome: "pending", userId };
  if (tx.reference !== payment.provider_ref) {
    console.error("[billing] référence incohérente", tx.reference, payment.provider_ref);
    return { outcome: "unknown", userId };
  }

  if (tx.status === "successful") {
    if (tx.currency !== expected.currency || tx.amount + 0.001 < expected.amount) {
      console.error("[billing] montant ou devise incorrects", tx, expected);
      await admin
        .from("payments")
        .update({
          status: "failed",
          failure_reason: "amount_mismatch",
          provider_tx_id: tx.transactionId,
        })
        .eq("id", payment.id)
        .neq("status", "successful");
      return { outcome: "failed", userId };
    }
    const { data, error } = await admin.rpc("complete_payment", {
      p_payment_id: payment.id,
      p_provider_tx_id: tx.transactionId,
      p_method: tx.method ?? "",
    });
    if (error) throw error;
    const applied = data?.[0]?.applied === true;
    if (applied) {
      await recordAudit({
        actorType: "system",
        actorId: userId,
        eventType: "billing.payment_succeeded",
        metadata: {
          payment_id: payment.id,
          plan: payment.plan,
          kind: payment.kind,
          amount: Number(payment.amount),
          currency: payment.currency,
          provider: provider.name,
        },
      });
    }
    await issueReceipt(payment.id, { email: applied });
    return { outcome: "successful", userId };
  }

  if (tx.status === "failed") {
    const { data: updated } = await admin
      .from("payments")
      .update({
        status: "failed",
        failure_reason: tx.failureReason,
        provider_tx_id: tx.transactionId,
      })
      .eq("id", payment.id)
      .in("status", ["pending", "cancelled"])
      .select("id");
    if (updated?.length) {
      await recordAudit({
        actorType: "system",
        actorId: userId,
        eventType: "billing.payment_failed",
        metadata: { payment_id: payment.id, reason: tx.failureReason },
      });
      await notify(admin, userId, "payment_failed", payment.id, (p) =>
        paymentFailedEmail({
          fullName: p.full_name,
          amount: formatMoney(expected.amount, expected.currency, p.locale),
          reason: tx.failureReason,
          locale: p.locale,
        }),
      );
    }
    return { outcome: "failed", userId };
  }
  return { outcome: "pending", userId };
}

export type BillingCronSummary = Record<
  "trialEnding" | "trialEnded" | "reminders" | "grace" | "expired" | "switched" | "abandoned",
  number
>;

/** Seuil de rappel de renouvellement : J-5, J-2 et jour J (dernières 24 h). */
export function reminderBucket(periodEnd: Date, now: Date): 0 | 2 | 5 | null {
  const left = periodEnd.getTime() - now.getTime();
  if (left <= 0) return null;
  if (left <= DAY) return 0;
  if (left <= 2 * DAY) return 2;
  if (left <= 5 * DAY) return 5;
  return null;
}

/**
 * Tâche quotidienne de facturation : rappels (fin d'essai, renouvellement), passage en
 * grâce puis en lecture seule, bascules de plan programmées, paiements abandonnés.
 * Chaque étape est idempotente : relancer la tâche ne renvoie aucun e-mail en double.
 */
export async function runBillingCron(now = new Date()): Promise<BillingCronSummary> {
  const admin = createAdminClient();
  const summary: BillingCronSummary = {
    trialEnding: 0,
    trialEnded: 0,
    reminders: 0,
    grace: 0,
    expired: 0,
    switched: 0,
    abandoned: 0,
  };
  const iso = now.toISOString();
  const LIMIT = 500;

  // 1. Essais qui se terminent dans les 2 jours.
  const { data: ending } = await admin
    .from("subscriptions")
    .select("user_id, current_period_end")
    .eq("status", "trialing")
    .gt("current_period_end", iso)
    .lte("current_period_end", new Date(now.getTime() + 2 * DAY).toISOString())
    .limit(LIMIT);
  for (const sub of ending ?? []) {
    const end = new Date(sub.current_period_end);
    if (
      await notify(admin, sub.user_id, "trial_ending", sub.current_period_end, (p) =>
        trialEndingEmail({
          fullName: p.full_name,
          endDate: formatLongDate(end, p.locale),
          locale: p.locale,
        }),
      )
    )
      summary.trialEnding++;
  }

  // 2. Essais terminés → lecture seule.
  const { data: ended } = await admin
    .from("subscriptions")
    .update({ status: "expired" })
    .eq("status", "trialing")
    .lte("current_period_end", iso)
    .select("user_id, current_period_end");
  for (const sub of ended ?? []) {
    summary.trialEnded++;
    await notify(admin, sub.user_id, "trial_ended", sub.current_period_end, (p) =>
      trialEndedEmail({ fullName: p.full_name, locale: p.locale }),
    );
  }

  // 3. Bascules de plan programmées arrivées à échéance.
  const { data: scheduled } = await admin
    .from("subscriptions")
    .select("id, scheduled_plan")
    .not("scheduled_plan", "is", null)
    .lte("scheduled_plan_at", iso)
    .limit(LIMIT);
  for (const sub of scheduled ?? []) {
    if (!isPaidPlan(sub.scheduled_plan)) continue;
    await admin
      .from("subscriptions")
      .update({ plan: sub.scheduled_plan, scheduled_plan: null, scheduled_plan_at: null })
      .eq("id", sub.id);
    summary.switched++;
  }

  // 4. Rappels de renouvellement (J-5, J-2, J).
  const { data: renewing } = await admin
    .from("subscriptions")
    .select("user_id, plan, scheduled_plan, billing_cycle, currency, current_period_end")
    .eq("status", "active")
    .eq("cancel_at_period_end", false)
    .gt("current_period_end", iso)
    .lte("current_period_end", new Date(now.getTime() + 5 * DAY).toISOString())
    .limit(LIMIT);
  if (renewing?.length) {
    const { data: prices } = await admin
      .from("plans_config")
      .select("plan, currency, monthly_price, yearly_price");
    for (const sub of renewing) {
      const end = new Date(sub.current_period_end);
      const bucket = reminderBucket(end, now);
      const plan = isPaidPlan(sub.scheduled_plan)
        ? sub.scheduled_plan
        : isPaidPlan(sub.plan)
          ? sub.plan
          : null;
      if (bucket === null || !plan) continue;
      const currency = (sub.currency ?? "XAF") as Currency;
      const cycle = (sub.billing_cycle ?? "monthly") as BillingCycle;
      const row = prices?.find((p) => p.plan === plan && p.currency === currency);
      const price = row ? (cycle === "yearly" ? row.yearly_price : row.monthly_price) : 0;
      if (
        await notify(admin, sub.user_id, `renewal_${bucket}`, sub.current_period_end, (p) =>
          renewalReminderEmail({
            fullName: p.full_name,
            planLabel: planName(plan, p.locale),
            endDate: formatLongDate(end, p.locale),
            daysLeft: bucket,
            price: formatMoney(price, currency, p.locale),
            locale: p.locale,
          }),
        )
      )
        summary.reminders++;
    }
  }

  // 5. Échéance dépassée sans renouvellement → période de grâce (3 jours).
  const { data: lapsed } = await admin
    .from("subscriptions")
    .update({ status: "past_due" })
    .eq("status", "active")
    .eq("cancel_at_period_end", false)
    .lte("current_period_end", iso)
    .gt("current_period_end", new Date(now.getTime() - GRACE_PERIOD_DAYS * DAY).toISOString())
    .select("user_id, current_period_end");
  for (const sub of lapsed ?? []) {
    summary.grace++;
    const graceEnd = new Date(new Date(sub.current_period_end).getTime() + GRACE_PERIOD_DAYS * DAY);
    await notify(admin, sub.user_id, "grace", sub.current_period_end, (p) =>
      graceStartedEmail({
        fullName: p.full_name,
        graceEnd: formatLongDate(graceEnd, p.locale),
        locale: p.locale,
      }),
    );
  }

  // 6. Fin de grâce, ou annulation arrivée à terme → lecture seule.
  const graceLimit = new Date(now.getTime() - GRACE_PERIOD_DAYS * DAY).toISOString();
  const expiredRows = [
    ...((
      await admin
        .from("subscriptions")
        .update({ status: "expired" })
        .in("status", ["active", "past_due"])
        .eq("cancel_at_period_end", false)
        .lte("current_period_end", graceLimit)
        .select("user_id, current_period_end")
    ).data ?? []),
    ...((
      await admin
        .from("subscriptions")
        .update({ status: "expired" })
        .in("status", ["active", "past_due"])
        .eq("cancel_at_period_end", true)
        .lte("current_period_end", iso)
        .select("user_id, current_period_end")
    ).data ?? []),
  ];
  for (const sub of expiredRows) {
    summary.expired++;
    await notify(admin, sub.user_id, "expired", sub.current_period_end, (p) =>
      subscriptionExpiredEmail({ fullName: p.full_name, locale: p.locale }),
    );
  }

  // 7. Paiements jamais finalisés (checkout abandonné) après 24 h.
  const { data: abandoned } = await admin
    .from("payments")
    .update({ status: "cancelled" })
    .eq("status", "pending")
    .lte("created_at", new Date(now.getTime() - DAY).toISOString())
    .select("id");
  summary.abandoned = abandoned?.length ?? 0;

  return summary;
}
