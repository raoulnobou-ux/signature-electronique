import { ChevronDown } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Section, SectionHeading } from "./section";

/**
 * FAQ en éléments <details> natifs : accessibles au clavier et aux lecteurs d'écran,
 * sans aucun JavaScript (page d'accueil plus légère).
 */
export async function Faq() {
  const t = await getTranslations("landing.faq");
  const items = t.raw("items") as { q: string; a: string }[];

  // Données structurées FAQPage pour les moteurs de recherche.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: { "@type": "Answer", text: item.a },
    })),
  };

  return (
    <Section id="faq" labelledBy="faq-title" className="max-w-3xl">
      <SectionHeading id="faq-title" eyebrow={t("eyebrow")} title={t("title")} />
      <div className="reveal mt-12">
        {items.map((item) => (
          <details key={item.q} name="faq" className="group border-b border-border">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-5 text-left text-base font-medium transition-colors hover:text-accent-foreground [&::-webkit-details-marker]:hidden">
              {item.q}
              <ChevronDown
                className="size-4 shrink-0 text-muted-foreground transition-transform duration-300 group-open:rotate-180"
                aria-hidden
              />
            </summary>
            <p className="pb-5 text-sm leading-relaxed text-muted-foreground">{item.a}</p>
          </details>
        ))}
      </div>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />
    </Section>
  );
}
