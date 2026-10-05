import { getTranslations } from "next-intl/server";
import { ClientMessages } from "@/components/providers/client-messages";
import { detectCurrency, getPlanLimits, getPrices } from "@/lib/pricing";
import { PricingPlans } from "./pricing-plans";
import { Section, SectionHeading } from "./section";

export async function PricingSection({ asPageHeader = false }: { asPageHeader?: boolean }) {
  const [t, prices, limits, currency] = await Promise.all([
    getTranslations("landing.pricing"),
    getPrices(),
    getPlanLimits(),
    detectCurrency(),
  ]);

  return (
    <Section
      id="tarifs"
      labelledBy="pricing-title"
      className={asPageHeader ? "pt-14 sm:pt-20" : undefined}
    >
      {asPageHeader ? (
        <div className="mx-auto max-w-2xl space-y-3 text-center">
          <p className="text-sm font-semibold tracking-wide text-accent-foreground uppercase">
            {t("eyebrow")}
          </p>
          <h1
            id="pricing-title"
            className="font-display text-4xl font-semibold tracking-tight sm:text-6xl"
          >
            {t("title")}
          </h1>
          <p className="text-muted-foreground sm:text-lg">{t("subtitle")}</p>
        </div>
      ) : (
        <SectionHeading
          id="pricing-title"
          eyebrow={t("eyebrow")}
          title={t("title")}
          subtitle={t("subtitle")}
        />
      )}
      <div className="mt-12">
        <ClientMessages namespaces={["landing.pricing"]}>
          <PricingPlans
            prices={prices}
            limits={limits}
            defaultCurrency={currency}
            headingLevel={asPageHeader ? 2 : 3}
          />
        </ClientMessages>
      </div>
    </Section>
  );
}
