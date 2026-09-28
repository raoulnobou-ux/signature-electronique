"use client";

import { Sparkles } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ShellAccount } from "./types";

/** Rappel compact des jours d'essai dans l'en-tête mobile (la barre latérale est masquée). */
export function TrialPill({ account }: { account: ShellAccount }) {
  const t = useTranslations("app.trial");
  if (account.state !== "trial" || account.trialDaysRemaining === null) return null;
  return (
    <Link
      href="/app/abonnement"
      className="inline-flex h-8 items-center gap-1.5 rounded-full glass px-3 text-xs font-medium lg:hidden"
    >
      <Sparkles className="size-3.5 text-accent-foreground" aria-hidden />
      {t("daysLeft", { days: account.trialDaysRemaining })}
    </Link>
  );
}
