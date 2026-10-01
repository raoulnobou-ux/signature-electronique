"use client";

import { CreditCard, Lock, ShieldCheck, Smartphone } from "lucide-react";
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
import { cn } from "@/lib/utils";
import { CFA_COUNTRIES } from "@/lib/billing/cfa";

type Selection = { plan: PaidPlan; cycle: BillingCycle; currency: Currency };

/** Plans de l'espace Abonnement : devis exact (prorata) puis redirection vers le paiement. */
export function CheckoutPlans({
  prices,
  defaultCurrency,
  methods,
  countries,
  defaultCountry,
  testMode,
  state,
  plan,
}: {
  prices: PriceTable;
  defaultCurrency: Currency;
  /** Moyens de paiement configurés : FCFA → Mobile Money (pawaPay), USD → carte (Paddle). */
  methods: Record<Currency, boolean>;
  /** Pays proposés pour le Mobile Money (ISO alpha-3), et celui présélectionné. */
  countries: string[];
  defaultCountry: string;
  /** Prestataire en bac à sable : aucun argent réel n'est débité. */
  testMode: Record<Currency, boolean>;
  state: AccessState;
  plan: PlanId;
}) {
  const t = useTranslations("app.billing");
  const tPricing = useTranslations("landing.pricing");
  const format = useFormatter();
  const locale = useLocale();
  const [selection, setSelection] = useState<Selection | null>(null);
  const [country, setCountry] = useState(defaultCountry);
  const regionNames = new Intl.DisplayNames([locale], { type: "region" });
  const countryName = (code: string) => {
    const alpha2 = CFA_COUNTRIES[code]?.alpha2;
    return (alpha2 && regionNames.of(alpha2)) || code;
  };
  const [quote, setQuote] = useState<{
    quote: Quote;
    startsAt: string;
    endsAt: string;
    deferred: boolean;
  } | null>(null);
  const [loadingQuote, startQuote] = useTransition();
  const [paying, startPaying] = useTransition();

  const planName = (p: PaidPlan) => tPricing(`plans.${p}.name`);
  const labelFor = (p: PaidPlan) => {
    if (state === "active" && plan === p) return t("labels.renew", { plan: planName(p) });
    if (state === "active" && plan === "essential" && p === "pro") return t("labels.upgrade");
    if (state === "active" && plan === "pro" && p === "essential")
      return t("labels.switch", { plan: planName(p) });
    return t("labels.choose", { plan: planName(p) });
  };

  const available = methods.XAF || methods.USD;

  const select = (p: PaidPlan, cycle: BillingCycle, shown: Currency) => {
    // Devise affichée si son moyen de paiement est disponible, sinon l'autre.
    const currency = methods[shown] ? shown : shown === "XAF" ? "USD" : "XAF";
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

  /** Choix du moyen de paiement : nouveau devis dans la devise correspondante. */
  const chooseMethod = (currency: Currency) => {
    if (!selection || selection.currency === currency) return;
    select(selection.plan, selection.cycle, currency);
  };

  const pay = () => {
    if (!selection) return;
    startPaying(async () => {
      const result = await startCheckout(
        selection.currency === "XAF" ? { ...selection, country } : selection,
      );
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

      <Dialog
        open={selection !== null}
        onOpenChange={(open) => !open && !paying && setSelection(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("checkout.title")}</DialogTitle>
            <DialogDescription>
              {q
                ? t("checkout.plan", {
                    plan: planName(q.plan),
                    cycle: t(`checkout.cycles.${q.cycle}`),
                  })
                : " "}
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
                  <span
                    data-testid="checkout-amount"
                    className="font-display text-3xl font-semibold tabular-nums"
                  >
                    {formatMoney(q.amount, q.currency, locale)}
                  </span>
                </span>
              </div>
              <p className="text-sm">
                {q.kind === "upgrade"
                  ? t("checkout.prorata", {
                      date: format.dateTime(periodEnd!, { dateStyle: "long" }),
                    })
                  : quote.deferred
                    ? t("checkout.startsLater", {
                        date: format.dateTime(new Date(quote.startsAt), { dateStyle: "long" }),
                      })
                    : t("checkout.startsNow", {
                        date: format.dateTime(periodEnd!, { dateStyle: "long" }),
                      })}
              </p>
              <fieldset className="space-y-2">
                <legend className="mb-2 text-sm font-medium">{t("checkout.method")}</legend>
                {(["XAF", "USD"] as const).map((currency) => {
                  const Icon = currency === "XAF" ? Smartphone : CreditCard;
                  // Le prorata garde la devise de l'abonnement en cours.
                  const locked = q.kind === "upgrade" && q.currency !== currency;
                  const disabled = !methods[currency] || locked || loadingQuote;
                  const checked = q.currency === currency;
                  return (
                    <label
                      key={currency}
                      className={cn(
                        "flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors",
                        checked ? "border-primary bg-primary/5" : "border-border",
                        disabled && "cursor-not-allowed opacity-50",
                      )}
                    >
                      <input
                        type="radio"
                        name="payment-method"
                        className="mt-1 accent-[var(--color-primary)]"
                        checked={checked}
                        disabled={disabled}
                        onChange={() => chooseMethod(currency)}
                      />
                      <Icon className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
                      <span>
                        <span className="block text-sm font-medium">
                          {t(`checkout.methods.${currency}.title`)}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          {!methods[currency]
                            ? t("checkout.methods.unavailable")
                            : locked
                              ? t("checkout.methods.locked")
                              : t(`checkout.methods.${currency}.body`)}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </fieldset>
              {q.currency === "XAF" && countries.length > 0 && (
                <div className="space-y-1.5">
                  <label htmlFor="mobile-money-country" className="text-sm font-medium">
                    {t("checkout.country")}
                  </label>
                  <select
                    id="mobile-money-country"
                    value={country}
                    onChange={(event) => setCountry(event.target.value)}
                    className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm"
                  >
                    {countries.map((code) => (
                      <option key={code} value={code}>
                        {countryName(code)}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-muted-foreground">{t("checkout.countryHint")}</p>
                </div>
              )}
              {testMode[q.currency] && (
                <p
                  role="note"
                  className="rounded-xl border border-warning/30 bg-warning/10 px-3 py-2 text-sm"
                >
                  {t("checkout.testMode")}
                </p>
              )}
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li className="flex gap-2">
                  <ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />{" "}
                  {t("checkout.secure")}
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
              <Lock />{" "}
              {q
                ? t("checkout.pay", { amount: formatMoney(q.amount, q.currency, locale) })
                : t("choose")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
