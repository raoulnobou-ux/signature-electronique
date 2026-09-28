"use client";

import { Sparkles } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { TRIAL_DAYS } from "@/lib/entitlements/plans";
import type { ShellAccount } from "./types";

/** Jauge d'essai dans la barre latérale (uniquement pendant l'essai). */
export function TrialCard({ account }: { account: ShellAccount }) {
  const t = useTranslations("app.trial");
  if (account.state !== "trial" || account.trialDaysRemaining === null) return null;
  const days = account.trialDaysRemaining;

  return (
    <div className="gradient-border rounded-2xl glass p-4">
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
        <Sparkles className="size-4 text-accent-foreground" aria-hidden />
        {t("cardTitle")}
      </div>
      <p className="mb-3 text-xs text-muted-foreground">{t("cardBody")}</p>
      <div className="mb-3 space-y-1.5">
        <Progress value={(days / TRIAL_DAYS) * 100} aria-label={t("daysLeft", { days })} />
        <p className="text-xs font-medium">{t("daysLeft", { days })}</p>
      </div>
      <Button asChild size="sm" className="w-full">
        <Link href="/app/abonnement">{t("choosePlan")}</Link>
      </Button>
    </div>
  );
}
