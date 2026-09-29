import { ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { AmbientBackground } from "@/components/brand/ambient-background";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { isLocale } from "@/i18n/config";
import { securityContent } from "./content";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("security");
  return { title: t("metaTitle"), description: t("metaDescription") };
}

export default async function SecurityPage() {
  const locale = await getLocale();
  const c = securityContent[isLocale(locale) ? locale : "fr"];
  return (
    <div className="relative isolate">
      <AmbientBackground intensity="subtle" />
      <section className="mx-auto max-w-4xl px-4 pt-14 pb-10 text-center sm:px-6 sm:pt-20">
        <Badge variant="outline" className="mb-5 glass px-3 py-1 text-foreground">
          <ShieldCheck aria-hidden /> {c.badge}
        </Badge>
        <h1 className="font-display text-4xl font-semibold tracking-tight text-balance sm:text-6xl">
          {c.titleStart} <span className="text-gradient">{c.titleHighlight}</span>
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-muted-foreground sm:text-lg">{c.intro}</p>
      </section>

      <section aria-labelledby="protections-title" className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <h2 id="protections-title" className="sr-only">
          {c.protectionsTitle}
        </h2>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {c.protections.map(({ icon: Icon, title, description }) => (
            <li key={title} className="reveal rounded-3xl glass p-6">
              <div className="mb-4 flex size-11 items-center justify-center rounded-xl bg-accent">
                <Icon className="size-5 text-accent-foreground" aria-hidden />
              </div>
              <h3 className="font-display text-lg font-semibold">{title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{description}</p>
            </li>
          ))}
        </ul>
      </section>

      <section
        id="validite-juridique"
        aria-labelledby="legal-title"
        className="mx-auto max-w-3xl scroll-mt-20 px-4 py-16 sm:px-6"
      >
        <div className="prose max-w-none prose-neutral dark:prose-invert prose-headings:font-display prose-headings:tracking-tight">
          <h2 id="legal-title" className="text-3xl sm:text-4xl">
            {c.legalTitle}
          </h2>
          {c.legal}
        </div>

        <div className="mt-12 flex flex-col gap-3 sm:flex-row">
          <Button asChild size="lg">
            <Link href="/inscription">{c.ctaTrial}</Link>
          </Button>
          <Button asChild size="lg" variant="secondary">
            <Link href="/contact">{c.ctaContact}</Link>
          </Button>
        </div>
      </section>
    </div>
  );
}
