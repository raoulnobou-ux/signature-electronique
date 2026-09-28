import { getTranslations } from "next-intl/server";
import { Avatar } from "@/components/ui/avatar";
import { testimonials } from "@/content/testimonials";
import { Section, SectionHeading } from "./section";

/**
 * Témoignages. La section ne s'affiche que lorsque de vrais témoignages ont été ajoutés
 * dans content/testimonials.ts (aucun faux avis n'est publié).
 */
export async function Testimonials() {
  if (testimonials.length === 0) return null;
  const t = await getTranslations("landing.testimonials");

  return (
    <Section labelledBy="testimonials-title">
      <SectionHeading id="testimonials-title" eyebrow={t("eyebrow")} title={t("title")} />
      <ul className="mt-12 grid gap-4 md:grid-cols-3">
        {testimonials.map((item) => (
          <li
            key={item.name}
            className="reveal flex flex-col justify-between gap-6 rounded-3xl glass p-6"
          >
            <blockquote className="text-pretty">« {item.quote} »</blockquote>
            <div className="flex items-center gap-3">
              <Avatar name={item.name} src={item.avatarUrl} />
              <div>
                <p className="text-sm font-semibold">{item.name}</p>
                <p className="text-xs text-muted-foreground">{item.role}</p>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </Section>
  );
}
