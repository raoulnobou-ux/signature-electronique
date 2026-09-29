import { getLocale } from "next-intl/server";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";

/** Mise en page des pages juridiques : titre, date de mise à jour, contenu typographié. */
export async function LegalPage({
  title,
  updatedAt,
  draft = true,
  children,
}: {
  title: string;
  updatedAt: string;
  /** Texte provisoire, à faire relire par un juriste avant l'ouverture publique. */
  draft?: boolean;
  children: ReactNode;
}) {
  const english = (await getLocale()) === "en";
  return (
    <article className="mx-auto max-w-3xl px-4 py-14 sm:px-6 sm:py-20">
      <header className="mb-10 space-y-4 border-b border-border pb-8">
        {draft && (
          <Badge variant="warning">
            {english
              ? "Provisional version — under legal review"
              : "Version provisoire — en cours de relecture juridique"}
          </Badge>
        )}
        <h1 className="font-display text-4xl font-semibold tracking-tight sm:text-5xl">{title}</h1>
        <p className="text-sm text-muted-foreground">
          {english ? `Last updated: ${updatedAt}` : `Dernière mise à jour : ${updatedAt}`}
        </p>
        {english && (
          <p lang="en" className="rounded-xl border border-border bg-secondary/50 p-3 text-sm">
            This document is available in French only. The French version is the legally binding
            one.
          </p>
        )}
      </header>
      <div className="prose max-w-none prose-neutral dark:prose-invert prose-headings:font-display prose-headings:tracking-tight prose-h2:mt-10 prose-h2:text-2xl prose-a:text-primary dark:prose-a:text-accent-foreground">
        {children}
      </div>
    </article>
  );
}
