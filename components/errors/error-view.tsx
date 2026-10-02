"use client";

import { RotateCcw } from "lucide-react";
import Link from "next/link";
import { useSyncExternalStore } from "react";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";

const TEXT = {
  fr: {
    title: "Un imprévu de notre côté.",
    body: "Cette page n'a pas pu s'afficher. Vos documents et vos données ne sont pas affectés. Réessayez dans un instant ; si le problème persiste, écrivez-nous en indiquant la référence ci-dessous.",
    retry: "Réessayer",
    home: "Retour à l'accueil",
    reference: "Référence",
  },
  en: {
    title: "Something went wrong on our side.",
    body: "This page couldn't be displayed. Your documents and data are not affected. Please try again in a moment; if the problem persists, write to us with the reference below.",
    retry: "Try again",
    home: "Back to home",
    reference: "Reference",
  },
} as const;

/**
 * Page d'erreur inattendue : message clair et rassurant, jamais de détail technique ;
 * seule la référence (digest) est affichée, pour retrouver l'erreur dans la surveillance.
 */
export function ErrorView({ digest, retry }: { digest?: string; retry: () => void }) {
  // Langue de la page (attribut lang du document), sans fournisseur de traductions.
  const lang = useSyncExternalStore(
    () => () => {},
    () => document.documentElement.lang,
    () => "fr",
  );
  const t = TEXT[lang.startsWith("en") ? "en" : "fr"];

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 px-4 text-center">
      <Link href="/" aria-label="QuickSign">
        <Logo />
      </Link>
      <h1 className="font-display text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
        {t.title}
      </h1>
      <p className="max-w-md text-muted-foreground">{t.body}</p>
      <div className="flex flex-col gap-3 sm:flex-row">
        <Button size="lg" onClick={retry}>
          <RotateCcw aria-hidden /> {t.retry}
        </Button>
        <Button asChild size="lg" variant="secondary">
          <Link href="/">{t.home}</Link>
        </Button>
      </div>
      {digest && (
        <p className="font-mono text-xs text-muted-foreground">
          {t.reference} : {digest}
        </p>
      )}
    </main>
  );
}
