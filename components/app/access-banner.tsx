"use client";

import { AlertTriangle, Clock, Lock } from "lucide-react";
import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ShellAccount } from "./types";

/**
 * Bandeau d'état du compte, en haut de chaque page :
 * fin d'essai proche (≤ 2 jours), période de grâce, ou lecture seule.
 */
export function AccessBanner({ account }: { account: ShellAccount }) {
  const t = useTranslations("app.trial");
  const format = useFormatter();

  let tone: "info" | "warning" | "danger" | null = null;
  let icon = Clock;
  let text = "";
  let cta = t("choosePlan");

  if (
    account.state === "trial" &&
    account.trialDaysRemaining !== null &&
    account.trialDaysRemaining <= 2
  ) {
    tone = "info";
    text = t("endingSoon", {
      when: format.relativeTime(new Date(account.periodEndsAt), new Date()),
    });
  } else if (account.state === "grace" && account.graceEndsAt) {
    tone = "warning";
    icon = AlertTriangle;
    text = t("grace", {
      date: format.dateTime(new Date(account.periodEndsAt), { dateStyle: "long" }),
      graceEnd: format.dateTime(new Date(account.graceEndsAt), { dateStyle: "long" }),
    });
    cta = t("renew");
  } else if (account.state === "expired") {
    tone = "danger";
    icon = Lock;
    text = t("expired");
    cta = t("upgrade");
  }

  if (!tone) return null;
  const Icon = icon;

  return (
    <div
      role="status"
      className={cn(
        "flex flex-col gap-3 border-b px-4 py-3 text-sm sm:flex-row sm:items-center sm:px-6",
        tone === "info" && "border-ring/30 bg-accent",
        tone === "warning" && "border-warning/30 bg-warning/10",
        tone === "danger" && "border-destructive/30 bg-destructive/10",
      )}
    >
      <Icon
        className={cn(
          "hidden size-4 shrink-0 sm:block",
          tone === "info" && "text-accent-foreground",
          tone === "warning" && "text-warning",
          tone === "danger" && "text-destructive",
        )}
        aria-hidden
      />
      <p className="flex-1">
        {account.state === "expired" && <strong className="mr-1">{t("expiredTitle")} —</strong>}
        {account.state === "grace" && <strong className="mr-1">{t("graceTitle")} —</strong>}
        {text}
      </p>
      <Button
        asChild
        size="sm"
        variant={tone === "info" ? "default" : "secondary"}
        className="shrink-0"
      >
        <Link href="/app/abonnement">{cta}</Link>
      </Button>
    </div>
  );
}
