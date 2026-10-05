import { Check, Minus } from "lucide-react";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { Faq } from "@/components/marketing/faq";
import { FinalCta } from "@/components/marketing/final-cta";
import { PricingSection } from "@/components/marketing/pricing-section";
import { formatBytes } from "@/lib/format";
import { getPlanLimits } from "@/lib/pricing";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("pricingPage");
  return { title: t("metaTitle"), description: t("metaDescription") };
}

type Cell = string | boolean;

export default async function PricingPage() {
  const [t, tPlans, limits, locale] = await Promise.all([
    getTranslations("pricingPage"),
    getTranslations("landing.pricing"),
    getPlanLimits(),
    getLocale(),
  ]);
  const r = (key: Parameters<typeof t>[0]) => t(key);
  // Chiffres lus dans plans_config : ceux réellement appliqués aux comptes.
  const count = (value: number | null | undefined) =>
    value === null || value === undefined ? r("unlimited") : String(value);
  const ai = (value: number | null) =>
    value === null ? r("rows.aiPro") : t("rows.aiPerDay", { count: value });
  const { free, essential, pro } = limits;

  const rows: { label: string; free: Cell; essential: Cell; pro: Cell }[] = [
    {
      label: r("rows.stored"),
      free: count(free.documentsStored),
      essential: count(essential.documentsStored),
      pro: count(pro.documentsStored),
    },
    {
      label: r("rows.documents"),
      free: false,
      essential: count(essential.documentsPerMonth),
      pro: count(pro.documentsPerMonth),
    },
    { label: r("rows.editor"), free: true, essential: true, pro: true },
    {
      label: r("rows.signatures"),
      free: count(free.signatureAssets),
      essential: count(essential.signatureAssets),
      pro: count(pro.signatureAssets),
    },
    {
      label: r("rows.storage"),
      free: formatBytes(free.storageBytes, locale),
      essential: formatBytes(essential.storageBytes, locale),
      pro: formatBytes(pro.storageBytes, locale),
    },
    {
      label: r("rows.ai"),
      free: ai(free.aiMessagesPerDay),
      essential: ai(essential.aiMessagesPerDay),
      pro: ai(pro.aiMessagesPerDay),
    },
    { label: r("rows.stamps"), free: false, essential: false, pro: true },
    { label: r("rows.multi"), free: false, essential: false, pro: true },
    { label: r("rows.audit"), free: false, essential: false, pro: true },
    { label: r("rows.templates"), free: false, essential: false, pro: true },
    { label: r("rows.whatsapp"), free: false, essential: false, pro: true },
    { label: r("rows.bulk"), free: false, essential: false, pro: true },
    {
      label: r("rows.team"),
      free: String(free.teamMembers),
      essential: String(essential.teamMembers),
      pro: String(pro.teamMembers),
    },
    { label: r("rows.support"), free: false, essential: false, pro: true },
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
                <th
                  scope="col"
                  className="p-3 text-left font-medium text-muted-foreground sm:px-6 sm:py-4"
                >
                  {t("feature")}
                </th>
                <th
                  scope="col"
                  className="w-20 p-2 text-center font-display font-semibold sm:w-32 sm:p-4"
                >
                  {tPlans("free.name")}
                </th>
                <th
                  scope="col"
                  className="w-20 p-2 text-center font-display font-semibold sm:w-32 sm:p-4"
                >
                  {tPlans("plans.essential.name")}
                </th>
                <th
                  scope="col"
                  className="w-20 p-2 text-center font-display font-semibold sm:w-32 sm:p-4"
                >
                  <span className="text-gradient">{tPlans("plans.pro.name")}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.label} className="border-b border-border last:border-0">
                  <th scope="row" className="p-3 text-left font-normal sm:px-6 sm:py-4">
                    {row.label}
                  </th>
                  <td className="p-2 text-center text-muted-foreground sm:p-4">
                    {renderCell(row.free)}
                  </td>
                  <td className="p-2 text-center text-muted-foreground sm:p-4">
                    {renderCell(row.essential)}
                  </td>
                  <td className="p-2 text-center font-medium sm:p-4">{renderCell(row.pro)}</td>
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
