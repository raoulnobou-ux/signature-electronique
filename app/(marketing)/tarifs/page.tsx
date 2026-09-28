import { Check, Minus } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Faq } from "@/components/marketing/faq";
import { FinalCta } from "@/components/marketing/final-cta";
import { PricingSection } from "@/components/marketing/pricing-section";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("pricingPage");
  return { title: t("metaTitle"), description: t("metaDescription") };
}

type Cell = string | boolean;

export default async function PricingPage() {
  const t = await getTranslations("pricingPage");
  const r = (key: Parameters<typeof t>[0]) => t(key);

  const rows: { label: string; essential: Cell; pro: Cell }[] = [
    { label: r("rows.documents"), essential: "50", pro: r("unlimited") },
    { label: r("rows.signatures"), essential: "5", pro: r("unlimited") },
    { label: r("rows.storage"), essential: "1 Go", pro: "20 Go" },
    { label: r("rows.ai"), essential: r("rows.aiEssential"), pro: r("rows.aiPro") },
    { label: r("rows.stamps"), essential: false, pro: true },
    { label: r("rows.multi"), essential: false, pro: true },
    { label: r("rows.audit"), essential: false, pro: true },
    { label: r("rows.templates"), essential: false, pro: true },
    { label: r("rows.whatsapp"), essential: false, pro: true },
    { label: r("rows.bulk"), essential: false, pro: true },
    { label: r("rows.team"), essential: "1", pro: "5" },
    { label: r("rows.support"), essential: false, pro: true },
  ];

  const renderCell = (value: Cell) =>
    typeof value === "string" ? (
      value
    ) : value ? (
      <>
        <Check className="mx-auto size-5 text-success" aria-hidden />
        <span className="sr-only">{t("included")}</span>
      </>
    ) : (
      <>
        <Minus className="mx-auto size-5 text-muted-foreground/50" aria-hidden />
        <span className="sr-only">{t("notIncluded")}</span>
      </>
    );

  return (
    <>
      <PricingSection asPageHeader />
      <section aria-labelledby="compare-title" className="mx-auto max-w-4xl px-4 sm:px-6">
        <h2
          id="compare-title"
          className="mb-8 text-center font-display text-2xl font-semibold sm:text-3xl"
        >
          {t("compareTitle")}
        </h2>
        <div className="overflow-hidden rounded-3xl glass">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th scope="col" className="p-4 text-left font-medium text-muted-foreground sm:px-6">
                  {t("feature")}
                </th>
                <th scope="col" className="w-28 p-4 text-center font-display font-semibold sm:w-40">
                  Essentiel
                </th>
                <th scope="col" className="w-28 p-4 text-center font-display font-semibold sm:w-40">
                  <span className="text-gradient">Pro</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.label} className="border-b border-border last:border-0">
                  <th scope="row" className="p-4 text-left font-normal sm:px-6">
                    {row.label}
                  </th>
                  <td className="p-4 text-center text-muted-foreground">
                    {renderCell(row.essential)}
                  </td>
                  <td className="p-4 text-center font-medium">{renderCell(row.pro)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <Faq />
      <FinalCta />
    </>
  );
}
