import type { AccessState } from "@/lib/entitlements";
import type { BillingCycle, Currency, PaidPlan, PlanId } from "@/lib/entitlements/plans";

export type PaymentKind = "new" | "renewal" | "upgrade";

export type PriceTable = Record<PaidPlan, Record<Currency, Record<BillingCycle, number>>>;

export interface QuoteSubscription {
  state: AccessState;
  plan: PlanId;
  billingCycle: BillingCycle | null;
  currency: Currency | null;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
}

export interface Quote {
  kind: PaymentKind;
  plan: PaidPlan;
  cycle: BillingCycle;
  currency: Currency;
  amount: number;
  /** Prix plein de la période (pour l'affichage « au lieu de »). */
  fullPrice: number;
}

/** Montant minimal accepté pour un paiement (les opérateurs refusent les très petits montants). */
export const MIN_AMOUNT: Record<Currency, number> = { XAF: 100, USD: 1 };

/** Arrondi à l'unité de la devise : FCFA entiers (au supérieur, par 5), dollars au centime. */
export function roundAmount(value: number, currency: Currency): number {
  if (currency === "XAF") return Math.ceil(value / 5) * 5;
  return Math.ceil(value * 100) / 100;
}

/**
 * Détermine ce que l'utilisateur paie :
 * - Essentiel actif → Pro : « upgrade » immédiat, au prorata des jours restants, dans le
 *   cycle et la devise de l'abonnement en cours ;
 * - période payée ou grâce : « renewal » à plein tarif, la nouvelle période s'enchaîne
 *   à la fin de l'actuelle ;
 * - essai ou compte expiré : « new » (les jours d'essai restants sont conservés).
 */
export function quoteCheckout(
  sub: QuoteSubscription,
  target: { plan: PaidPlan; cycle: BillingCycle; currency: Currency },
  prices: PriceTable,
  now = new Date(),
): Quote {
  const periodActive = sub.state === "active" && sub.currentPeriodEnd.getTime() > now.getTime();

  if (
    periodActive &&
    sub.plan === "essential" &&
    target.plan === "pro" &&
    !sub.cancelAtPeriodEnd &&
    sub.billingCycle &&
    sub.currency
  ) {
    const cycle = sub.billingCycle;
    const currency = sub.currency;
    const total = sub.currentPeriodEnd.getTime() - sub.currentPeriodStart.getTime();
    const left = sub.currentPeriodEnd.getTime() - now.getTime();
    const ratio = total > 0 ? Math.min(1, Math.max(0, left / total)) : 1;
    const difference = prices.pro[currency][cycle] - prices.essential[currency][cycle];
    const amount = Math.max(MIN_AMOUNT[currency], roundAmount(difference * ratio, currency));
    return {
      kind: "upgrade",
      plan: "pro",
      cycle,
      currency,
      amount,
      fullPrice: prices.pro[currency][cycle],
    };
  }

  const price = prices[target.plan][target.currency][target.cycle];
  return {
    kind: sub.state === "expired" || sub.state === "trial" ? "new" : "renewal",
    plan: target.plan,
    cycle: target.cycle,
    currency: target.currency,
    amount: price,
    fullPrice: price,
  };
}
