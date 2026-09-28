"use client";

import { Lock, ShieldCheck, Smartphone } from "lucide-react";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { getCheckoutQuote, startCheckout } from "@/app/(app)/app/abonnement/actions";
import { PricingPlans } from "@/components/marketing/pricing-plans";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import type { Quote } from "@/lib/billing/quote";
import type { AccessState } from "@/lib/entitlements";
import type { BillingCycle, Currency, PaidPlan, PlanId } from "@/lib/entitlements/plans";
import { formatMoney } from "@/lib/format";
import type { PriceTable } from "@/lib/pricing";

type Selection = { plan: PaidPlan; cycle: BillingCycle; currency: Currency };

/** Plans de l'espace Abonnement : devis exact (prorata) puis redirection vers le paiement. */
export function CheckoutPlans({
  prices,
  defaultCurrency,
  available,
  state,
  plan,
}: {
  prices: PriceTable;
  defaultCurrency: Currency;
  available: boolean;
  state: AccessState;
  plan: PlanId;
}) {
  const t = useTranslations("app.billing");
  const tPricing = useTranslations("landing.pricing");
  const format = useFormatter();
  const locale = useLocale();
  const [selection, setSelection] = useState<Selection | null>(null);
  const [quote, setQuote] = useState<{ quote: Quote; startsAt: string; endsAt: string; deferred: boolean } | null>(null);
  const [loadingQuote, startQuote] = useTransition();
  const [paying, startPaying] = useTransition();

  const planName = (p: PaidPlan) => tPricing(`plans.${p}.name`);
  const labelFor = (p: PaidPlan) => {
    if (state === "active" && plan === p) return t("labels.renew", { plan: planName(p) });
    if (state === "active" && plan === "essential" && p === "pro") return t("labels.upgrade");
    if (state === "active" && plan === "pro" && p === "essential") return t("labels.switch", { plan: planName(p) });
    return t("labels.choose", { plan: planName(p) });
  };

  const select = (p: PaidPlan, cycle: BillingCycle, currency: Currency) => {
    setSelection({ plan: p, cycle, currency });
    setQuote(null);
    startQuote(async () => {
      const result = await getCheckoutQuote({ plan: p, cycle, currency });
      if (result.ok) setQuote(result);
      else {
        toast.error(t(`errors.${result.reason}`));
        setSelection(null);
      }
    });
  };

  const pay = () => {
    if (!selection) return;
    startPaying(async () => {
      const result = await startCheckout(selection);
      if (result.ok) {
        toast.message(t("checkout.redirecting"));
        window.location.assign(result.url);
      } else toast.error(t(`errors.${result.reason}`));
    });
  };

  const q = quote?.quote;
  const periodEnd = quote ? new Date(quote.endsAt) : null;

  return (
    <>
      <PricingPlans
        prices={prices}
        defaultCurrency={defaultCurrency}
        headingLevel={3}
        checkout={{ label: t("choose"), labelFor, disabled: !available, onSelect: select }}
      />

      <Dialog open={selection !== null} onOpenChange={(open) => !open && !paying && setSelection(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("checkout.title")}</DialogTitle>
            <DialogDescription>
              {q ? t("checkout.plan", { plan: planName(q.plan), cycle: t(`checkout.cycles.${q.cycle}`) }) : " "}
            </DialogDescription>
          </DialogHeader>

          {loadingQuote || !q || !quote ? (
            <div className="space-y-3" aria-busy>
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-4 w-3/4" />
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-end justify-between gap-4 rounded-2xl border border-border bg-secondary/40 p-4">
                <span className="text-sm text-muted-foreground">{t("checkout.amount")}</span>
                <span className="text-right">
                  {q.amount !== q.fullPrice && (
                    <span className="mr-2 text-sm text-muted-foreground line-through">
                      {formatMoney(q.fullPrice, q.currency, locale)}
                    </span>
                  )}
                  <span data-testid="checkout-amount" className="font-display text-3xl font-semibold tabular-nums">
                    {formatMoney(q.amount, q.currency, locale)}
                  </span>
                </span>
              </div>
              <p className="text-sm">
                {q.kind === "upgrade"
                  ? t("checkout.prorata", { date: format.dateTime(periodEnd!, { dateStyle: "long" }) })
                  : quote.deferred
                    ? t("checkout.startsLater", { date: format.dateTime(new Date(quote.startsAt), { dateStyle: "long" }) })
                    : t("checkout.startsNow", { date: format.dateTime(periodEnd!, { dateStyle: "long" }) })}
              </p>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li className="flex gap-2">
                  <Smartphone className="mt-0.5 size-4 shrink-0" aria-hidden /> {t("methodsNote")}
                </li>
                <li className="flex gap-2">
                  <ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden /> {t("checkout.secure")}
                </li>
              </ul>
            </div>
          )}

          <DialogFooter>
            <DialogClose asChild>
              <Button variant="ghost" disabled={paying}>
                {t("checkout.cancel")}
              </Button>
            </DialogClose>
            <Button onClick={pay} loading={paying} disabled={!q || loadingQuote}>
              <Lock /> {q ? t("checkout.pay", { amount: formatMoney(q.amount, q.currency, locale) }) : t("choose")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
