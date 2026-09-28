import { Info } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/app/page-header";
import { SubscriptionOverview } from "@/components/billing/subscription-overview";
import { PricingPlans } from "@/components/marketing/pricing-plans";
import { ClientMessages } from "@/components/providers/client-messages";
import { requireAccount } from "@/lib/auth/account";
import { detectCurrency, getPrices } from "@/lib/pricing";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("app.billing");
  return { title: t("metaTitle") };
}

export default async function BillingPage() {
  const [account, t, prices, currency] = await Promise.all([
    requireAccount(),
    getTranslations("app.billing"),
    getPrices(),
    detectCurrency(),
  ]);

  return (
    <div className="mx-auto max-w-5xl space-y-12">
      <div>
        <PageHeader title={t("title")} />
        <SubscriptionOverview account={account} />
      </div>
      <section id="plans" aria-label={t("choose")} className="scroll-mt-24 space-y-6">
        <h2 className="font-display text-2xl font-semibold">{t("choose")}</h2>
        <p className="flex items-center gap-2 rounded-xl border border-border bg-secondary/50 px-4 py-3 text-sm text-muted-foreground">
          <Info className="size-4 shrink-0" aria-hidden />
          {t("paymentSoon")}
        </p>
        <ClientMessages namespaces={["landing.pricing", "app"]}>
          <PricingPlans
            prices={prices}
            defaultCurrency={currency}
            headingLevel={3}
            checkout={{ label: t("choose"), disabled: true }}
          />
        </ClientMessages>
      </section>
      <section aria-labelledby="history-title" className="space-y-4">
        <h2 id="history-title" className="font-display text-2xl font-semibold">
          {t("history")}
        </h2>
        <p className="text-sm text-muted-foreground">{t("noPayments")}</p>
      </section>
    </div>
  );
}
