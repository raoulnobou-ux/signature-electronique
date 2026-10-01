import { CheckCircle2, Clock, Info, XCircle } from "lucide-react";
import type { Metadata } from "next";
import { getFormatter, getTranslations } from "next-intl/server";
import { getLocale as getRequestLocale } from "next-intl/server";
import { PageHeader } from "@/components/app/page-header";
import { CheckoutPlans } from "@/components/billing/checkout-plans";
import { ReceiptButton } from "@/components/billing/receipt-button";
import { SubscriptionOverview } from "@/components/billing/subscription-overview";
import { ClientMessages } from "@/components/providers/client-messages";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { requireAccount } from "@/lib/auth/account";
import { getPaymentProvider } from "@/lib/billing";
import { paymentDescription } from "@/lib/billing/service";
import { isPaidPlan, type BillingCycle, type Currency } from "@/lib/entitlements/plans";
import { formatMoney } from "@/lib/format";
import { detectCurrency, getPrices } from "@/lib/pricing";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("app.billing");
  return { title: t("metaTitle") };
}

const RESULTS = {
  succes: { icon: CheckCircle2, tone: "border-success/30 bg-success/10" },
  echec: { icon: XCircle, tone: "border-destructive/30 bg-destructive/10" },
  attente: { icon: Clock, tone: "border-warning/30 bg-warning/10" },
} as const;

const STATUS_VARIANT = {
  successful: "success",
  pending: "warning",
  failed: "danger",
  cancelled: "muted",
} as const;

export default async function BillingPage({ searchParams }: PageProps<"/app/abonnement">) {
  const locale = await getRequestLocale();
  const [account, t, format, prices, detected, params, supabase] = await Promise.all([
    requireAccount(),
    getTranslations("app.billing"),
    getFormatter(),
    getPrices(),
    detectCurrency(),
    searchParams,
    createClient(),
  ]);

  const { data: payments } = await supabase
    .from("payments")
    .select(
      "id, created_at, paid_at, amount, currency, status, plan, billing_cycle, kind, receipt_number, receipt_path",
    )
    .order("created_at", { ascending: false })
    .limit(50);
  const { data: subscription } = await supabase.from("subscriptions").select("currency").single();

  const resultKey =
    typeof params.paiement === "string" && params.paiement in RESULTS
      ? (params.paiement as keyof typeof RESULTS)
      : null;
  const result = resultKey ? RESULTS[resultKey] : null;
  const methods = {
    XAF: getPaymentProvider("XAF") !== null,
    USD: getPaymentProvider("USD") !== null,
  };
  const available = methods.XAF || methods.USD;
  const currency = (subscription?.currency as Currency | null) ?? detected;

  return (
    <div className="mx-auto max-w-5xl space-y-12">
      <div>
        <PageHeader title={t("title")} />
        {result && resultKey && (
          <div role="status" className={cn("mb-6 flex gap-3 rounded-2xl border p-4", result.tone)}>
            <result.icon className="mt-0.5 size-5 shrink-0" aria-hidden />
            <div>
              <p className="font-semibold">{t(`result.${resultKey}.title`)}</p>
              <p className="text-sm text-muted-foreground">{t(`result.${resultKey}.body`)}</p>
            </div>
          </div>
        )}
        <SubscriptionOverview account={account} />
      </div>

      <section id="plans" aria-label={t("choose")} className="scroll-mt-24 space-y-6">
        <h2 className="font-display text-2xl font-semibold">{t("choose")}</h2>
        {!available && (
          <p className="flex items-center gap-2 rounded-xl border border-border bg-secondary/50 px-4 py-3 text-sm text-muted-foreground">
            <Info className="size-4 shrink-0" aria-hidden />
            {t("paymentUnavailable")}
          </p>
        )}
        <ClientMessages namespaces={["landing.pricing", "app"]}>
          <CheckoutPlans
            prices={prices}
            defaultCurrency={currency}
            methods={methods}
            state={account.entitlements.state}
            plan={account.entitlements.subscriptionPlan}
          />
        </ClientMessages>
      </section>

      <section aria-labelledby="history-title" className="space-y-4">
        <h2 id="history-title" className="font-display text-2xl font-semibold">
          {t("history")}
        </h2>
        {!payments?.length ? (
          <p className="text-sm text-muted-foreground">{t("noPayments")}</p>
        ) : (
          <Card>
            <CardContent className="p-0">
              <ul className="divide-y divide-border" data-testid="payment-history">
                {payments.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {isPaidPlan(p.plan)
                          ? paymentDescription(p.plan, p.billing_cycle as BillingCycle, p.kind)
                          : p.plan}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {format.dateTime(new Date(p.paid_at ?? p.created_at), {
                          dateStyle: "medium",
                        })}
                        {p.receipt_number && ` · ${p.receipt_number}`}
                      </p>
                    </div>
                    <span className="text-sm font-semibold tabular-nums">
                      {formatMoney(Number(p.amount), p.currency as Currency, locale)}
                    </span>
                    <Badge
                      variant={STATUS_VARIANT[p.status as keyof typeof STATUS_VARIANT] ?? "muted"}
                    >
                      {t(`paymentStatus.${p.status as keyof typeof STATUS_VARIANT}`)}
                    </Badge>
                    {p.receipt_path && p.receipt_number && (
                      <ReceiptButton paymentId={p.id} number={p.receipt_number} />
                    )}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </section>
    </div>
  );
}
