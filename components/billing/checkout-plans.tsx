"use client";

import { CreditCard, Lock, ShieldCheck, Smartphone, Wallet } from "lucide-react";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  getCheckoutQuote,
  startCheckout,
  type BillingError,
} from "@/app/(app)/app/abonnement/actions";
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
import type { PaymentChannel } from "@/lib/billing";
import type { PaymentMethod, PaymentOption } from "@/lib/billing/providers/types";
import type { Quote } from "@/lib/billing/quote";
import type { AccessState } from "@/lib/entitlements";
import type { BillingCycle, Currency, PaidPlan, PlanId } from "@/lib/entitlements/plans";
import { formatMoney } from "@/lib/format";
import type { LimitsTable, PriceTable } from "@/lib/pricing";
import { cn } from "@/lib/utils";
import { CFA_COUNTRIES } from "@/lib/billing/cfa";

const METHOD_ICONS: Record<PaymentMethod, typeof CreditCard> = {
  card: CreditCard,
  mobile_money: Smartphone,
};

/** Icône d'un canal Notch Pay selon son type (mobile, card, wallet…). */
const channelIcon = (type: string) =>
  type === "card" ? CreditCard : type === "wallet" ? Wallet : Smartphone;

type Selection = { plan: PaidPlan; cycle: BillingCycle; currency: Currency; method: PaymentMethod };

/** Plans de l'espace Abonnement : devis exact (prorata) puis redirection vers le paiement. */
export function CheckoutPlans({
  prices,
  limits,
  defaultCurrency,
  options,
  channels,
  countries,
  defaultCountry,
  state,
  plan,
}: {
  prices: PriceTable;
  limits: LimitsTable;
  defaultCurrency: Currency;
  /** Moyens de paiement proposés (carte : EUR/USD/GBP ; Mobile Money : FCFA), selon le pays. */
  options: PaymentOption[];
  /** Canaux ouverts sur le compte du prestataire (MTN, Orange…) ; null = inconnus. */
  channels: PaymentChannel[] | null;
  /** Pays proposés pour le Mobile Money (ISO alpha-3), et celui présélectionné. */
  countries: string[];
  defaultCountry: string;
  state: AccessState;
  plan: PlanId;
}) {
  const t = useTranslations("app.billing");
  const router = useRouter();
  const tPricing = useTranslations("landing.pricing");
  const format = useFormatter();
  const locale = useLocale();
  const [selection, setSelection] = useState<Selection | null>(null);
  const [country, setCountry] = useState(defaultCountry);
  const regionNames = new Intl.DisplayNames([locale], { type: "region" });
  const currencyNames = new Intl.DisplayNames([locale], { type: "currency" });
  const currencyName = (code: Currency) => `${currencyNames.of(code) ?? code} (${code})`;
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

  const available = options.length > 0;
  const optionOf = (method: PaymentMethod) => options.find((o) => o.method === method);

  /** Message d'erreur ; numéro manquant : lien vers le profil pour l'ajouter. */
  const showError = (reason: BillingError) =>
    toast.error(
      t(`errors.${reason}`),
      reason === "phone_required"
        ? {
            action: {
              label: t("checkout.addPhone"),
              onClick: () => router.push("/app/parametres"),
            },
          }
        : undefined,
    );

  /**
   * Devis pour un plan, une devise et un moyen de paiement. En cas de refus (prix fixes
   * sans prorata, numéro manquant…), le choix précédent est conservé.
   */
  const requestQuote = (next: Selection, previous: Selection | null) => {
    setSelection(next);
    setQuote(null);
    startQuote(async () => {
      const result = await getCheckoutQuote(next);
      if (result.ok) setQuote(result);
      else {
        showError(result.reason);
        if (previous) requestQuote(previous, null);
        else setSelection(null);
      }
    });
  };

  const select = (p: PaidPlan, cycle: BillingCycle, shown: Currency) => {
    // Le Mobile Money d'abord pour le FCFA, puis le premier moyen qui accepte la devise.
    const option =
      options.find((o) => o.method === "mobile_money" && o.currencies.includes(shown)) ??
      options.find((o) => o.currencies.includes(shown)) ??
      options[0];
    if (!option) return;
    const currency = option.currencies.includes(shown) ? shown : option.currencies[0]!;
    requestQuote({ plan: p, cycle, currency, method: option.method }, null);
  };

  /** Autre moyen de paiement : nouveau devis (sa devise si l'actuelle n'y est pas). */
  const chooseMethod = (option: PaymentOption) => {
    if (!selection || selection.method === option.method) return;
    const currency = option.currencies.includes(selection.currency)
      ? selection.currency
      : option.currencies[0]!;
    requestQuote({ ...selection, method: option.method, currency }, selection);
  };

  /** Autre devise pour le même moyen de paiement. */
  const chooseCurrency = (currency: Currency) => {
    if (!selection || selection.currency === currency) return;
    requestQuote({ ...selection, currency }, selection);
  };

  const pay = () => {
    if (!selection) return;
    startPaying(async () => {
      const result = await startCheckout(
        selection.method === "mobile_money" ? { ...selection, country } : selection,
      );
      if (result.ok) {
        toast.message(t("checkout.redirecting"));
        window.location.assign(result.url);
      } else showError(result.reason);
    });
  };

  const q = quote?.quote;
  const selected = selection ? optionOf(selection.method) : undefined;
  const periodEnd = quote ? new Date(quote.endsAt) : null;

  return (
    <>
      <PricingPlans
        prices={prices}
        limits={limits}
        defaultCurrency={defaultCurrency}
        headingLevel={3}
        channels={
          options.some((o) => o.provider === "chariow")
            ? [...(channels?.map((c) => c.name) ?? []), tPricing("cardMethod")]
            : (channels?.map((c) => c.name) ?? null)
        }
        currencies={options.length ? options.flatMap((o) => o.currencies) : null}
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
                {options.map((option) => {
                  const Icon = METHOD_ICONS[option.method];
                  const checked = selection?.method === option.method;
                  // Le prorata garde la devise de l'abonnement en cours, et exige un montant
                  // calculé (impossible avec des prix fixes, comme chez Chariow).
                  const noProrata = q.kind === "upgrade" && !option.prorata;
                  const locked =
                    noProrata || (q.kind === "upgrade" && !option.currencies.includes(q.currency));
                  const disabled = locked || loadingQuote;
                  return (
                    <label
                      key={option.method}
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
                        onChange={() => chooseMethod(option)}
                      />
                      <Icon className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
                      <span className="min-w-0 space-y-2">
                        <span className="block text-sm font-medium">
                          {option.method === "mobile_money" &&
                          channels?.some((c) => c.type === "card")
                            ? t("checkout.methods.mobile_money.titleWithCard")
                            : t(`checkout.methods.${option.method}.title`)}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          {noProrata
                            ? t("checkout.methods.prorataLocked")
                            : locked
                              ? t("checkout.methods.locked")
                              : option.provider === "chariow"
                                ? t("checkout.methods.card.bodyChariow")
                                : t(`checkout.methods.${option.method}.body`)}
                        </span>
                        {option.method === "mobile_money" && !!channels?.length && (
                          <span className="flex flex-wrap gap-1.5" data-testid="payment-channels">
                            {channels.map((channel) => {
                              const ChannelIcon = channelIcon(channel.type);
                              return (
                                <span
                                  key={channel.id}
                                  className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2 py-0.5 text-xs"
                                >
                                  <ChannelIcon className="size-3.5" aria-hidden />
                                  {channel.name}
                                </span>
                              );
                            })}
                          </span>
                        )}
                      </span>
                    </label>
                  );
                })}
              </fieldset>
              {selected && selected.currencies.length > 1 && q.kind !== "upgrade" && (
                <div className="space-y-1.5">
                  <label htmlFor="payment-currency" className="text-sm font-medium">
                    {t("checkout.currency")}
                  </label>
                  <select
                    id="payment-currency"
                    value={q.currency}
                    disabled={loadingQuote}
                    onChange={(event) => chooseCurrency(event.target.value as Currency)}
                    className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm"
                  >
                    {selected.currencies.map((code) => (
                      <option key={code} value={code}>
                        {currencyName(code)}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {selected?.method === "mobile_money" && countries.length > 0 && (
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
              {selected?.testMode && (
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
