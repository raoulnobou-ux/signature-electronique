"use server";

import { randomUUID } from "node:crypto";
import { logAppError } from "@/lib/monitoring/app-errors";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { recordAudit } from "@/lib/audit";
import { getCurrentAccount, type Account } from "@/lib/auth/account";
import { getPaymentProvider, getSandboxProvider } from "@/lib/billing";
import { quoteCheckout, type Quote } from "@/lib/billing/quote";
import { SANDBOX_METHODS, SANDBOX_OUTCOMES } from "@/lib/billing/sandbox";
import { paymentDescription } from "@/lib/billing/service";
import type { BillingCycle, Currency, PlanId } from "@/lib/entitlements/plans";
import { publicEnv } from "@/lib/env";
import { getPrices } from "@/lib/pricing";
import { rateLimit } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";

const targetSchema = z.object({
  plan: z.enum(["essential", "pro"]),
  cycle: z.enum(["monthly", "yearly"]),
  currency: z.enum(["XAF", "USD"]),
});

export type BillingError =
  | "unauthenticated"
  | "email_unverified"
  | "payments_unavailable"
  | "rate_limited"
  | "invalid"
  | "not_allowed"
  | "provider_error";

type Fail = { ok: false; reason: BillingError };

async function loadContext(): Promise<
  { account: Account; subscription: Awaited<ReturnType<typeof readSubscription>> } | Fail
> {
  const account = await getCurrentAccount();
  if (!account) return { ok: false, reason: "unauthenticated" };
  // Un compte expiré doit pouvoir payer : pas de garde « lecture seule » ici.
  if (!account.emailConfirmed) return { ok: false, reason: "email_unverified" };
  return { account, subscription: await readSubscription(account.userId) };
}

async function readSubscription(userId: string) {
  const { data } = await createAdminClient()
    .from("subscriptions")
    .select("*")
    .eq("user_id", userId)
    .single();
  return data;
}

async function computeQuote(
  account: Account,
  subscription: NonNullable<Awaited<ReturnType<typeof readSubscription>>>,
  target: z.infer<typeof targetSchema>,
): Promise<Quote> {
  return quoteCheckout(
    {
      state: account.entitlements.state,
      plan: subscription.plan as PlanId,
      billingCycle: subscription.billing_cycle as BillingCycle | null,
      currency: subscription.currency as Currency | null,
      currentPeriodStart: new Date(subscription.current_period_start),
      currentPeriodEnd: new Date(subscription.current_period_end),
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
    },
    target,
    await getPrices(),
  );
}

/** Montant exact à payer pour un plan (prorata éventuel), affiché avant le paiement. */
export async function getCheckoutQuote(
  input: z.input<typeof targetSchema>,
): Promise<{ ok: true; quote: Quote; startsAt: string; endsAt: string; deferred: boolean } | Fail> {
  const parsed = targetSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  const ctx = await loadContext();
  if ("ok" in ctx) return ctx;
  if (!ctx.subscription) return { ok: false, reason: "invalid" };
  if (!getPaymentProvider()) return { ok: false, reason: "payments_unavailable" };
  const quote = await computeQuote(ctx.account, ctx.subscription, parsed.data);
  const end = new Date(ctx.subscription.current_period_end);
  const startsAt =
    quote.kind !== "upgrade" &&
    ctx.account.entitlements.state !== "expired" &&
    ctx.account.entitlements.state !== "grace" &&
    end > new Date()
      ? end
      : new Date();
  // Même règle que complete_payment : +1 mois / +1 an, ou fin de période inchangée (upgrade).
  const endsAt = new Date(quote.kind === "upgrade" ? end : startsAt);
  if (quote.kind !== "upgrade") {
    if (quote.cycle === "yearly") endsAt.setFullYear(endsAt.getFullYear() + 1);
    else endsAt.setMonth(endsAt.getMonth() + 1);
  }
  return {
    ok: true,
    quote,
    startsAt: startsAt.toISOString(),
    endsAt: endsAt.toISOString(),
    deferred: startsAt.getTime() > Date.now() + 60_000,
  };
}

/** Crée le paiement (en attente) et renvoie l'URL du checkout du prestataire. */
export async function startCheckout(
  input: z.input<typeof targetSchema>,
): Promise<{ ok: true; url: string } | Fail> {
  const parsed = targetSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  const ctx = await loadContext();
  if ("ok" in ctx) return ctx;
  const { account, subscription } = ctx;
  if (!subscription) return { ok: false, reason: "invalid" };
  const provider = getPaymentProvider();
  if (!provider) return { ok: false, reason: "payments_unavailable" };
  if (!(await rateLimit("checkout", account.userId, 10, 600)))
    return { ok: false, reason: "rate_limited" };

  const quote = await computeQuote(account, subscription, parsed.data);
  // Identifiant de transaction : lettres, chiffres et tirets uniquement (exigence CinetPay).
  const reference = `QS-${randomUUID().replaceAll("-", "").slice(0, 24).toUpperCase()}`;
  const admin = createAdminClient();
  const { data: payment, error } = await admin
    .from("payments")
    .insert({
      user_id: account.userId,
      subscription_id: subscription.id,
      provider: provider.name,
      provider_ref: reference,
      amount: quote.amount,
      currency: quote.currency,
      status: "pending",
      plan: quote.plan,
      billing_cycle: quote.cycle,
      kind: quote.kind,
    })
    .select("id")
    .single();
  if (error || !payment) {
    console.error("[billing] création du paiement", error);
    return { ok: false, reason: "provider_error" };
  }

  try {
    const { url } = await provider.createCheckout({
      reference,
      amount: quote.amount,
      currency: quote.currency,
      description: paymentDescription(quote.plan, quote.cycle, quote.kind),
      customer: {
        email: account.email,
        name: account.profile.full_name,
        phone: account.profile.phone,
        city: account.profile.city,
      },
      redirectUrl: `${publicEnv.NEXT_PUBLIC_APP_URL}/api/billing/return?ref=${encodeURIComponent(reference)}`,
      notifyUrl: `${publicEnv.NEXT_PUBLIC_APP_URL}/api/webhooks/cinetpay`,
      meta: { user_id: account.userId, payment_id: payment.id, kind: quote.kind },
    });
    await recordAudit({
      actorType: "user",
      actorId: account.userId,
      eventType: "billing.checkout_started",
      metadata: {
        payment_id: payment.id,
        plan: quote.plan,
        cycle: quote.cycle,
        kind: quote.kind,
        amount: quote.amount,
        currency: quote.currency,
      },
    });
    return { ok: true, url };
  } catch (err) {
    console.error("[billing] checkout", err);
    await logAppError("billing.checkout", err, { userId: account.userId });
    const detail = err instanceof Error ? err.message.slice(0, 300) : "";
    await admin
      .from("payments")
      .update({ status: "failed", failure_reason: `checkout_error: ${detail}` })
      .eq("id", payment.id);
    return { ok: false, reason: "provider_error" };
  }
}

async function paidSubscriptionContext() {
  const ctx = await loadContext();
  if ("ok" in ctx) return ctx;
  if (
    !ctx.subscription ||
    ctx.subscription.plan === "trial" ||
    ctx.account.entitlements.state !== "active"
  ) {
    return { ok: false, reason: "not_allowed" } as Fail;
  }
  return { account: ctx.account, subscription: ctx.subscription };
}

/** Annulation : l'accès reste complet jusqu'à la fin de la période payée. */
export async function setCancelAtPeriodEnd(cancel: boolean): Promise<{ ok: true } | Fail> {
  const ctx = await paidSubscriptionContext();
  if ("ok" in ctx) return ctx;
  const { error } = await createAdminClient()
    .from("subscriptions")
    .update({ cancel_at_period_end: cancel })
    .eq("id", ctx.subscription.id)
    .gt("current_period_end", new Date().toISOString());
  if (error) return { ok: false, reason: "provider_error" };
  await recordAudit({
    actorType: "user",
    actorId: ctx.account.userId,
    eventType: cancel ? "billing.subscription_canceled" : "billing.subscription_resumed",
  });
  revalidatePath("/app", "layout");
  return { ok: true };
}

/** Pro → Essentiel : prend effet à la fin de la période payée (ou annule ce changement). */
export async function setScheduledDowngrade(downgrade: boolean): Promise<{ ok: true } | Fail> {
  const ctx = await paidSubscriptionContext();
  if ("ok" in ctx) return ctx;
  if (downgrade && ctx.subscription.plan !== "pro") return { ok: false, reason: "not_allowed" };
  const { error } = await createAdminClient()
    .from("subscriptions")
    .update(
      downgrade
        ? { scheduled_plan: "essential", scheduled_plan_at: ctx.subscription.current_period_end }
        : { scheduled_plan: null, scheduled_plan_at: null },
    )
    .eq("id", ctx.subscription.id);
  if (error) return { ok: false, reason: "provider_error" };
  await recordAudit({
    actorType: "user",
    actorId: ctx.account.userId,
    eventType: downgrade ? "billing.downgrade_scheduled" : "billing.downgrade_canceled",
  });
  revalidatePath("/app", "layout");
  return { ok: true };
}

/** Lien de téléchargement temporaire d'un reçu (le sien uniquement). */
export async function getReceiptUrl(paymentId: string): Promise<{ ok: true; url: string } | Fail> {
  if (!z.uuid().safeParse(paymentId).success) return { ok: false, reason: "invalid" };
  const account = await getCurrentAccount();
  if (!account) return { ok: false, reason: "unauthenticated" };
  const admin = createAdminClient();
  const { data: payment } = await admin
    .from("payments")
    .select("receipt_path, receipt_number")
    .eq("id", paymentId)
    .eq("user_id", account.userId)
    .single();
  if (!payment?.receipt_path) return { ok: false, reason: "not_allowed" };
  const { data } = await admin.storage
    .from("receipts")
    .createSignedUrl(payment.receipt_path, 120, { download: `Recu-${payment.receipt_number}.pdf` });
  return data ? { ok: true, url: data.signedUrl } : { ok: false, reason: "provider_error" };
}

/** Bac à sable local : simule la réponse de l'opérateur puis revient comme le ferait CinetPay. */
export async function completeSandboxPayment(input: {
  reference: string;
  outcome: string;
  method: string;
}): Promise<{ ok: true; url: string } | Fail> {
  const sandbox = getSandboxProvider();
  if (!sandbox) return { ok: false, reason: "payments_unavailable" };
  const parsed = z
    .object({
      reference: z.string().max(80),
      outcome: z.enum(SANDBOX_OUTCOMES),
      method: z.enum(SANDBOX_METHODS),
    })
    .safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  const account = await getCurrentAccount();
  if (!account) return { ok: false, reason: "unauthenticated" };
  const { data: payment } = await createAdminClient()
    .from("payments")
    .select("id")
    .eq("provider_ref", parsed.data.reference)
    .eq("user_id", account.userId)
    .single();
  if (!payment) return { ok: false, reason: "not_allowed" };
  const txId = sandbox.transactionId(
    parsed.data.reference,
    parsed.data.outcome,
    parsed.data.method,
  );
  const url = new URL("/api/billing/return", publicEnv.NEXT_PUBLIC_APP_URL);
  url.searchParams.set("status", parsed.data.outcome);
  url.searchParams.set("tx_ref", parsed.data.reference);
  url.searchParams.set("transaction_id", txId);
  return { ok: true, url: url.toString() };
}
