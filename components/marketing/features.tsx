import {
  Bot,
  FileText,
  Fingerprint,
  MessageCircle,
  Smartphone,
  Stamp,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { getTranslations } from "next-intl/server";
import { cn } from "@/lib/utils";
import { Section, SectionHeading } from "./section";

const icons: Record<string, LucideIcon> = {
  stamp: Stamp,
  momo: Wallet,
  whatsapp: MessageCircle,
  ai: Bot,
  proof: Fingerprint,
  multi: Users,
  word: FileText,
  mobile: Smartphone,
};

/** Cartes larges (deux colonnes sur grand écran) : 4 larges + 4 simples = 3 rangées pleines. */
const wide = new Set(["stamp", "ai", "word", "mobile"]);
/** Cartes mises en avant par un halo. */
const highlighted = new Set(["stamp", "ai"]);

export async function Features() {
  const t = await getTranslations("landing.features");
  const items = t.raw("items") as { key: string; title: string; description: string }[];

  return (
    <Section id="fonctionnalites" labelledBy="features-title">
      <SectionHeading
        id="features-title"
        eyebrow={t("eyebrow")}
        title={t("title")}
        subtitle={t("subtitle")}
      />
      <ul className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {items.map((item) => {
          const Icon = icons[item.key] ?? FileText;
          const big = highlighted.has(item.key);
          return (
            <li
              key={item.key}
              className={cn(
                "reveal group relative overflow-hidden rounded-3xl glass p-6 transition-[transform,border-color] duration-300 hover:-translate-y-1 hover:border-ring/30",
                wide.has(item.key) && "lg:col-span-2",
              )}
            >
              {big && (
                <div
                  aria-hidden
                  className="absolute -top-24 -right-24 size-64 rounded-full bg-[radial-gradient(closest-side,rgb(139_92_246/0.35),transparent)] opacity-60 transition-opacity duration-500 group-hover:opacity-100"
                />
              )}
              <div className="mb-5 flex size-11 items-center justify-center rounded-xl bg-accent">
                <Icon className="size-5 text-accent-foreground" aria-hidden />
              </div>
              <h3 className="font-display text-lg font-semibold">{item.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{item.description}</p>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}
