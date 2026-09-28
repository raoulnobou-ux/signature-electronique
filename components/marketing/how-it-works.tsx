import { FileUp, PenLine, Send } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Section, SectionHeading } from "./section";

const icons = [FileUp, PenLine, Send];

export async function HowItWorks() {
  const t = await getTranslations("landing.steps");
  const items = t.raw("items") as { title: string; description: string }[];

  return (
    <Section id="comment-ca-marche" labelledBy="steps-title">
      <SectionHeading
        id="steps-title"
        eyebrow={t("eyebrow")}
        title={t("title")}
        subtitle={t("subtitle")}
      />
      <ol className="relative mt-14 grid gap-5 md:grid-cols-3">
        {items.map((item, i) => {
          const Icon = icons[i] ?? FileUp;
          return (
            <li key={item.title} className="reveal relative">
              <div className="h-full rounded-3xl glass p-6 text-center transition-transform duration-300 hover:-translate-y-1 sm:p-8">
                <div className="relative mx-auto mb-6 flex size-20 items-center justify-center">
                  <div className="absolute -inset-4 bg-[radial-gradient(closest-side,rgb(129_140_248/0.35),transparent)]" />
                  <div className="relative flex size-16 items-center justify-center rounded-2xl glass">
                    <Icon className="size-7 text-accent-foreground" strokeWidth={1.7} aria-hidden />
                  </div>
                  <span className="absolute -top-1 -right-1 flex size-7 items-center justify-center rounded-full bg-brand-gradient font-display text-sm font-semibold text-white">
                    {i + 1}
                  </span>
                </div>
                <h3 className="font-display text-xl font-semibold">{item.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{item.description}</p>
              </div>
            </li>
          );
        })}
      </ol>
    </Section>
  );
}
