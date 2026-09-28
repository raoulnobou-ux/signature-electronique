import { ArrowRight, Check, Clock, Printer, Zap } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Section, SectionHeading } from "./section";

export async function BeforeAfter() {
  const t = await getTranslations("landing.beforeAfter");
  const before = t.raw("beforeSteps") as string[];
  const after = t.raw("afterSteps") as string[];

  return (
    <Section labelledBy="avant-apres-title" className="pb-8 sm:pb-12">
      <SectionHeading id="avant-apres-title" eyebrow={t("eyebrow")} title={t("title")} />
      <div className="mt-12 grid items-stretch gap-4 md:grid-cols-[1fr_auto_1fr]">
        <div className="reveal rounded-3xl border border-border bg-secondary/40 p-6 sm:p-8">
          <div className="mb-5 flex items-center gap-3 text-muted-foreground">
            <Printer className="size-5" aria-hidden />
            <h3 className="font-display text-lg font-semibold text-foreground">
              {t("beforeTitle")}
            </h3>
          </div>
          <ol className="space-y-3">
            {before.map((step, i) => (
              <li key={step} className="flex items-center gap-3 text-muted-foreground">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full border border-border text-xs">
                  {i + 1}
                </span>
                <span className="line-through decoration-muted-foreground/40">{step}</span>
              </li>
            ))}
          </ol>
          <p className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
            <Clock className="size-4" aria-hidden />
            {t("beforeTime")}
          </p>
        </div>

        <div className="hidden items-center justify-center md:flex" aria-hidden>
          <div className="flex size-12 items-center justify-center rounded-full glass">
            <ArrowRight className="size-5 text-accent-foreground" />
          </div>
        </div>

        <div className="reveal gradient-border rounded-3xl glass p-6 glow sm:p-8">
          <div className="mb-5 flex items-center gap-3">
            <Zap className="size-5 text-brand-cyan" aria-hidden />
            <h3 className="font-display text-lg font-semibold">{t("afterTitle")}</h3>
          </div>
          <ol className="space-y-3">
            {after.map((step) => (
              <li key={step} className="flex items-center gap-3">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-brand-gradient text-white">
                  <Check className="size-3.5" strokeWidth={3} aria-hidden />
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
          <p className="mt-6 flex items-center gap-2 text-sm font-medium text-accent-foreground">
            <Clock className="size-4" aria-hidden />
            {t("afterTime")}
          </p>
        </div>
      </div>
    </Section>
  );
}
