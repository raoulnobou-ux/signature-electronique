import { CalendarClock, Sparkles } from "lucide-react";
import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import type { Account } from "@/lib/auth/account";
import { TRIAL_DAYS } from "@/lib/entitlements/plans";
import { formatBytes } from "@/lib/format";

/** Carte « plan actuel + usage », partagée par la page Abonnement et les paramètres. */
export async function SubscriptionOverview({
  account,
  compact = false,
}: {
  account: Account;
  compact?: boolean;
}) {
  const [t, format] = await Promise.all([getTranslations("app.billing"), getFormatter()]);
  const ent = account.entitlements;
  const planLabel = ent.state === "trial" ? t("plans.trial") : t(`plans.${ent.subscriptionPlan}`);
  const stateVariant = {
    trial: "brand",
    active: "success",
    grace: "warning",
    expired: "danger",
  } as const;
  const date = format.dateTime(ent.periodEndsAt, { dateStyle: "long" });

  const usage = [
    {
      label: t("documents"),
      used: account.usage.documentsSignedThisMonth,
      total: ent.limits?.documentsPerMonth ?? null,
    },
    {
      label: t("signatures"),
      used: account.usage.signatureAssetsCount,
      total: ent.limits?.signatureAssets ?? null,
    },
    {
      label: t("ai"),
      used: account.usage.aiMessagesToday,
      total: ent.limits?.aiMessagesPerDay ?? null,
    },
  ];

  return (
    <div className="space-y-4">
      <Card className={ent.state === "trial" ? "gradient-border" : undefined}>
        <CardContent className="space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">{t("currentPlan")}</p>
              <p className="flex items-center gap-3 font-display text-3xl font-semibold">
                {planLabel}
                <Badge variant={stateVariant[ent.state]}>{t(`status.${ent.state}`)}</Badge>
              </p>
            </div>
            <Button asChild>
              <Link href="/app/abonnement#plans">
                <Sparkles /> {t("choose")}
              </Link>
            </Button>
          </div>

          {ent.state === "trial" && ent.trialDaysRemaining !== null ? (
            <div className="space-y-2">
              <Progress value={(ent.trialDaysRemaining / TRIAL_DAYS) * 100} />
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <CalendarClock className="size-4" aria-hidden />
                {t("trialEnds", { date })}
              </p>
            </div>
          ) : (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <CalendarClock className="size-4" aria-hidden />
              {ent.cancelAtPeriodEnd || ent.state !== "active"
                ? t("ends", { date })
                : t("renews", { date })}
            </p>
          )}
        </CardContent>
      </Card>

      {!compact && ent.limits && (
        <Card>
          <CardContent className="space-y-5">
            <p className="font-display text-lg font-semibold">{t("usage")}</p>
            {usage.map((row) => (
              <div key={row.label} className="space-y-1.5">
                <div className="flex justify-between gap-4 text-sm">
                  <span>{row.label}</span>
                  <span className="text-muted-foreground tabular-nums">
                    {row.total === null
                      ? t("unlimited", { used: row.used })
                      : t("of", { used: row.used, total: row.total })}
                  </span>
                </div>
                {row.total !== null && (
                  <Progress value={(row.used / Math.max(1, row.total)) * 100} />
                )}
              </div>
            ))}
            <div className="space-y-1.5">
              <div className="flex justify-between gap-4 text-sm">
                <span>{t("storage")}</span>
                <span className="text-muted-foreground tabular-nums">
                  {t("of", {
                    used: formatBytes(account.usage.storageBytesUsed),
                    total: formatBytes(ent.limits.storageBytes),
                  })}
                </span>
              </div>
              <Progress value={(account.usage.storageBytesUsed / ent.limits.storageBytes) * 100} />
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
