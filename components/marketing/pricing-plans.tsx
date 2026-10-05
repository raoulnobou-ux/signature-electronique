"use client";

import { Check, Sparkles } from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { CURRENCIES, CURRENCY_CODES } from "@/config/currencies";
import { Button } from "@/components/ui/button";
import type { BillingCycle, Currency, PaidPlan } from "@/lib/entitlements/plans";
import { formatMoney } from "@/lib/format";
import type { PriceTable } from "@/lib/pricing";
import { cn } from "@/lib/utils";

const PLANS: PaidPlan[] = ["essential", "pro"];

/** Sélecteur segmenté accessible (radiogroup). */
function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: React.ReactNode }[];
  label: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="inline-flex rounded-full border border-border bg-secondary p-1"
    >
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          role="radio"
          aria-checked={value === opt.value}
          onClick={() => onChange(opt.value)}
          className={cn(
            "inline-flex h-9 cursor-pointer items-center gap-2 rounded-full px-4 text-sm font-medium transition-all",
            value === opt.value
              ? "bg-background-elevated text-foreground shadow-soft"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export function PricingPlans({
  prices,
  defaultCurrency,
  headingLevel = 3,
  checkout,
}: {
  prices: PriceTable;
  defaultCurrency: Currency;
  /** Niveau des titres de plans : 2 sur la page Tarifs (sous le h1), 3 dans la landing. */
  headingLevel?: 2 | 3;
  /** Dans l'application : action de souscription (sinon, lien vers l'inscription). */
  checkout?: {
    label: string;
    /** Libellé propre à un plan (« Renouveler Pro », « Passer au Pro maintenant »…). */
    labelFor?: (plan: PaidPlan) => string;
    disabled?: boolean;
    onSelect?: (plan: PaidPlan, cycle: BillingCycle, currency: Currency) => void;
  };
}) {
  const PlanHeading = headingLevel === 2 ? "h2" : "h3";
  const t = useTranslations("landing.pricing");
  const locale = useLocale();
  const [cycle, setCycle] = useState<BillingCycle>("monthly");
  const [currency, setCurrency] = useState<Currency>(defaultCurrency);

  return (
    <div className="space-y-10">
      <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
        <Segmented
          label={t("monthly") + " / " + t("yearly")}
          value={cycle}
          onChange={setCycle}
          options={[
            { value: "monthly", label: t("monthly") },
            {
              value: "yearly",
              label: (
                <>
                  {t("yearly")}
                  <span className="rounded-full bg-success/15 px-2 py-0.5 text-[11px] text-success">
                    {t("yearlyBadge")}
                  </span>
                </>
              ),
            },
          ]}
        />
        <Segmented
          label={t("currencyLabel")}
          value={currency}
          onChange={setCurrency}
          options={CURRENCY_CODES.map((code) => ({
            value: code,
            label: code === "XAF" ? "FCFA" : code,
          }))}
        />
      </div>

      <ul className="mx-auto grid max-w-4xl gap-5 md:grid-cols-2">
        {PLANS.map((plan) => {
          const pro = plan === "pro";
          const price = prices[plan][currency][cycle];
          const monthlyEquivalent = prices[plan][currency].yearly / 12;
          const features = t.raw(`plans.${plan}.features`) as string[];
          const priceLabel =
            formatMoney(price, currency, locale) +
            " " +
            t(cycle === "monthly" ? "perMonth" : "perYear");

          return (
            <li
              key={plan}
              className={cn(
                "relative flex flex-col rounded-3xl glass p-7 sm:p-8",
                pro && "gradient-border glow md:-my-3 md:py-10",
              )}
            >
              {pro && (
                <Badge
                  variant="brand"
                  className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1"
                >
                  <Sparkles aria-hidden /> {t("popular")}
                </Badge>
              )}
              <PlanHeading className="font-display text-2xl font-semibold">
                {t(`plans.${plan}.name`)}
              </PlanHeading>
              <p className="mt-1.5 text-sm text-muted-foreground">
                {t(`plans.${plan}.description`)}
              </p>

              <p className="mt-6 flex items-baseline gap-2">
                <span className="font-display text-4xl font-semibold tracking-tight sm:text-5xl">
                  {formatMoney(price, currency, locale)}
                </span>
                <span className="text-muted-foreground">
                  {t(cycle === "monthly" ? "perMonth" : "perYear")}
                </span>
              </p>
              <p className="mt-1 h-5 text-sm text-muted-foreground">
                {cycle === "yearly" &&
                  t("equivalentMonthly", {
                    amount: formatMoney(
                      Math.round(monthlyEquivalent * 10 ** CURRENCIES[currency].decimals) /
                        10 ** CURRENCIES[currency].decimals,
                      currency,
                      locale,
                    ),
                  })}
              </p>

              {checkout ? (
                <Button
                  size="lg"
                  variant={pro ? "default" : "secondary"}
                  className="mt-6"
                  disabled={checkout.disabled}
                  onClick={() => checkout.onSelect?.(plan, cycle, currency)}
                >
                  {checkout.labelFor?.(plan) ?? checkout.label}
                </Button>
              ) : (
                <>
                  <Button
                    asChild
                    size="lg"
                    variant={pro ? "default" : "secondary"}
                    className="mt-6"
                  >
                    <Link href={`/inscription?plan=${plan}`}>{t("cta")}</Link>
                  </Button>
                  <p className="mt-3 text-center text-xs text-muted-foreground">
                    {t("trialNote", { price: priceLabel })}
                  </p>
                </>
              )}

              <ul className="mt-7 space-y-3 border-t border-border pt-7">
                {features.map((feature, i) => (
                  <li
                    key={feature}
                    className={cn(
                      "flex gap-3 text-sm",
                      pro && i === 0 && "font-semibold text-foreground",
                    )}
                  >
                    {!(pro && i === 0) && (
                      <Check
                        className="mt-0.5 size-4 shrink-0 text-accent-foreground"
                        aria-hidden
                      />
                    )}
                    {feature}
                  </li>
                ))}
              </ul>
            </li>
          );
        })}
      </ul>
      <p className="text-center text-sm text-muted-foreground">{t("paymentMethods")}</p>
    </div>
  );
}
