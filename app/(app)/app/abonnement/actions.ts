"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";
import { z } from "zod";
import { isCurrency } from "@/config/currencies";
import { recordAudit } from "@/lib/audit";
import { getCurrentAccount, type Account } from "@/lib/auth/account";
import {
  getPaymentProvider,
  getProvider,
  getSandboxProvider,
  mobileMoneyCountries,
  paymentChannels,
} from "@/lib/billing";
import { ChariowProvider, chariowPhone } from "@/lib/billing/providers/card/chariow";
import { failureKind, type FailureKind } from "@/lib/billing/failure";
import { quoteCheckout, type Quote } from "@/lib/billing/quote";
import { SANDBOX_METHODS, SANDBOX_OUTCOMES } from "@/lib/billing/providers/sandbox";
import { providerErrorKind, type PaymentProvider } from "@/lib/billing/providers/types";
import { PLAN_LABELS, paymentDescription, settlePayment } from "@/lib/billing/service";
import { getClientIp } from "@/lib/request";
import type { BillingCycle, Currency, PlanId } from "@/lib/entitlements/plans";
import { toLocale } from "@/i18n/config";
import { publicEnv } from "@/lib/env";
import { logAppError } from "@/lib/monitoring/app-errors";
import { getPrices } from "@/lib/pricing";
import { rateLimit } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";

const targetSchema = z.object({
  plan: z.enum(["essential", "pro"]),
  cycle: z.enum(["monthly", "yearly"]),
  currency: z.string().refine(isCurrency),
  /** Pays du numéro Mobile Money (paiement en FCFA). */
  country: z
    .string()
    .regex(/^[A-Z]{3}$/)
    .optional(),
  /** Moyen choisi : Mobile Money (Notch Pay) ou carte (Chariow) ; absent = celui de la devise. */
  method: z.enum(["card", "mobile_money"]).optional(),
});

export type BillingError =
  | "unauthenticated"
  | "email_unverified"
  | "payments_unavailable"
  | "rate_limited"
  | "invalid"
  | "not_allowed"
  | "provider_error"
  | "provider_unreachable"
  | "prorata_unavailable"
  | "phone_required";

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
  // Prestataire à prix fixes (Chariow) : pas de prorata, le Pro démarre à la fin de la période.
  const provider = target.method
    ? getProvider(target.method, target.currency as Currency)
    : getPaymentProvider(target.currency as Currency);
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
    new Date(),
    { prorata: !provider?.fixedPrices },
  );
}

/**
 * Prestataire du moyen choisi, et refus explicites quand il ne convient pas : prix fixes
 * (pas de prorata), produit non configuré pour ce plan, ou numéro de téléphone exigé.
 */
function resolveProvider(
  target: z.infer<typeof targetSchema>,
  quote: Quote,
  account: Account,
): { provider: PaymentProvider } | Fail {
  const provider = target.method
    ? getProvider(target.method, quote.currency)
    : getPaymentProvider(quote.currency);
  if (!provider) return { ok: false, reason: "payments_unavailable" };
  if (provider.fixedPrices && quote.kind === "upgrade") {
    return { ok: false, reason: "prorata_unavailable" };
  }
  if (provider instanceof ChariowProvider) {
    if (!provider.productFor(quote.plan, quote.cycle)) {
      return { ok: false, reason: "payments_unavailable" };
    }
    if (!chariowPhone(account.profile.phone)) return { ok: false, reason: "phone_required" };
  }
  return { provider };
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
  const quote = await computeQuote(ctx.account, ctx.subscription, parsed.data);
  const resolved = resolveProvider(parsed.data, quote, ctx.account);
  if ("ok" in resolved) return resolved;
  const end = new Date(ctx.subscription.current_period_end);
  const startsAt =
    quote.kind !== "upgrade" &&
    ctx.account.entitlements.state !== "free" &&
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
  // Tentatives limitées par compte et par adresse IP (plusieurs personnes peuvent partager
  // une connexion : la limite par IP est plus large).
  const ip = (await getClientIp()) ?? "unknown";
  if (
    !(await rateLimit("checkout", account.userId, 10, 600)) ||
    !(await rateLimit("checkout-ip", ip, 30, 600))
  )
    return { ok: false, reason: "rate_limited" };

  const quote = await computeQuote(account, subscription, parsed.data);
  const resolved = resolveProvider(parsed.data, quote, account);
  if ("ok" in resolved) return resolved;
  const { provider } = resolved;
  // Aucun canal ouvert sur le compte Notch Pay : inutile d'envoyer le client payer.
  if (provider.name === "notchpay") {
    const channels = await paymentChannels();
    if (channels !== null && channels.length === 0) {
      return { ok: false, reason: "payments_unavailable" };
    }
  }
  // Pays du Mobile Money, quand le prestataire demande au client de le choisir.
  let country: string | undefined;
  if (quote.currency === "XAF") {
    const countries = await mobileMoneyCountries();
    if (countries.length) {
      country = parsed.data.country ?? countries[0];
      if (!country || !countries.includes(country)) return { ok: false, reason: "invalid" };
    }
  }
  // Référence unique : UUID v4.
  const reference = randomUUID();
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
    const locale = await getLocale();
    const { url, transactionId } = await provider.createCheckout({
      reference,
      amount: quote.amount,
      currency: quote.currency,
      description: paymentDescription(quote.plan, quote.cycle, quote.kind, toLocale(locale)),
      productName: `QuickSign ${PLAN_LABELS[quote.plan]}`,
      language: locale === "en" ? "en" : "fr",
      customer: {
        email: account.email,
        name: account.profile.full_name,
        phone: account.profile.phone,
        city: account.profile.city,
      },
      // Page d'état du paiement : elle n'active rien, elle demande au serveur de revérifier.
      redirectUrl: `${publicEnv.NEXT_PUBLIC_APP_URL}/app/abonnement/paiement?ref=${encodeURIComponent(reference)}`,
      country,
      plan: quote.plan,
      cycle: quote.cycle,
      kind: quote.kind,
      customerIp: ip === "unknown" ? undefined : ip,
      meta: { user_id: account.userId, payment_id: payment.id, kind: quote.kind },
    });
    if (transactionId) {
      await admin.from("payments").update({ provider_tx_id: transactionId }).eq("id", payment.id);
    }
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
    // Diagnostic : catégorie (config, rejected, network…), message du prestataire et notre
    // référence, qui sert d'identifiant de corrélation (payments.provider_ref, merchant_reference
    // chez Notch Pay, journaux). Aucune nouvelle tentative automatique : le client réessaie.
    const kind = providerErrorKind(err);
    const detail = err instanceof Error ? err.message.slice(0, 300) : "";
    console.error("[billing] checkout", { reference, kind, detail });
    await logAppError("billing.checkout", `${kind} — ${detail}`, {
      userId: account.userId,
      code: reference,
    });
    await admin
      .from("payments")
      .update({ status: "failed", failure_reason: `checkout_error:${kind}: ${detail}` })
      .eq("id", payment.id);
    return {
      ok: false,
      reason: kind === "network" || kind === "timeout" ? "provider_unreachable" : "provider_error",
    };
  }
}

async function paidSubscriptionContext() {
  const ctx = await loadContext();
  if ("ok" in ctx) return ctx;
  if (
    !ctx.subscription ||
    ctx.subscription.plan === "trial" ||
    ctx.subscription.plan === "free" ||
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

export type PaymentCheck = {
  ok: true;
  status: "pending" | "successful" | "failed";
  failure: FailureKind | null;
};

/**
 * État d'un paiement du compte connecté, pour la page de retour. Un paiement encore en
 * attente est revérifié auprès du prestataire (jamais d'après l'adresse de retour) ; c'est
 * cette revérification, pas le navigateur, qui peut activer l'abonnement.
 * `hint` : identifiant Notch Pay (« trx.… ») ajouté par Notch Pay à l'adresse de retour,
 * utilisé seulement si celui noté à la création manque ; la transaction doit de toute façon
 * porter notre référence.
 */
export async function checkPayment(input: {
  reference: string;
  hint?: string | null;
}): Promise<PaymentCheck | Fail> {
  const parsed = z
    .object({
      reference: z.uuid(),
      hint: z
        .string()
        .regex(/^trx\.[A-Za-z0-9_]{4,100}$/)
        .nullish(),
    })
    .safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  const account = await getCurrentAccount();
  if (!account) return { ok: false, reason: "unauthenticated" };

  const admin = createAdminClient();
  const read = () =>
    admin
      .from("payments")
      .select("status, failure_reason")
      .eq("provider_ref", parsed.data.reference)
      .eq("user_id", account.userId)
      .maybeSingle();
  let { data: payment } = await read();
  if (!payment) return { ok: false, reason: "not_allowed" };

  // Revérification limitée : la page interroge toutes les 5 s pendant 3 minutes au plus.
  if (payment.status === "pending" && (await rateLimit("payment-check", account.userId, 60, 600))) {
    try {
      await settlePayment({
        reference: parsed.data.reference,
        transactionId: parsed.data.hint ?? null,
      });
    } catch (error) {
      console.error("[billing] revérification du paiement", error);
    }
    payment = (await read()).data ?? payment;
  }

  if (payment.status === "successful") return { ok: true, status: "successful", failure: null };
  if (payment.status === "failed" || payment.status === "cancelled") {
    return {
      ok: true,
      status: "failed",
      failure: failureKind(payment.status === "cancelled" ? "abandoned" : payment.failure_reason),
    };
  }
  return { ok: true, status: "pending", failure: null };
}

/** Bac à sable local : simule la réponse de l'opérateur puis revient comme le ferait un prestataire. */
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
