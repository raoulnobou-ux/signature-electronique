"use client";

import { CalendarClock } from "lucide-react";
import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { setCancelAtPeriodEnd, setScheduledDowngrade } from "@/app/(app)/app/abonnement/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { AccessState } from "@/lib/entitlements";
import type { PaidPlan, PlanId } from "@/lib/entitlements/plans";

/** Annulation / reprise et rétrogradation programmée d'un abonnement payé. */
export function SubscriptionActions({
  state,
  plan,
  periodEnd,
  cancelAtPeriodEnd,
  scheduledPlan,
  scheduledPlanAt,
}: {
  state: AccessState;
  plan: PlanId;
  periodEnd: string;
  cancelAtPeriodEnd: boolean;
  scheduledPlan: PaidPlan | null;
  scheduledPlanAt: string | null;
}) {
  const t = useTranslations("app.billing");
  const format = useFormatter();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirmCancel, setConfirmCancel] = useState(false);
  const date = (iso: string) => format.dateTime(new Date(iso), { dateStyle: "long" });

  const run = (action: () => Promise<{ ok: boolean; reason?: string }>) =>
    start(async () => {
      const result = await action();
      if (result.ok) {
        toast.success(t("manage.done"));
        setConfirmCancel(false);
        router.refresh();
      } else toast.error(t(`errors.${(result.reason ?? "invalid") as "invalid"}`));
    });

  const notes: string[] = [];
  const isDowngrade = scheduledPlan === "essential" && scheduledPlanAt && Math.abs(new Date(scheduledPlanAt).getTime() - new Date(periodEnd).getTime()) < 1000;
  if (scheduledPlan && scheduledPlanAt && !isDowngrade) {
    notes.push(t("manage.switchNote", { plan: t(`plans.${scheduledPlan}`), date: date(scheduledPlanAt) }));
  }
  if (isDowngrade) notes.push(t("manage.downgradeNote", { date: date(scheduledPlanAt!) }));
  if (cancelAtPeriodEnd) notes.push(t("manage.canceledNote", { date: date(periodEnd) }));

  const paid = state === "active" && plan !== "trial";

  return (
    <div className="space-y-3">
      {notes.map((note) => (
        <p key={note} className="flex items-center gap-2 rounded-xl bg-secondary/60 px-3 py-2 text-sm">
          <CalendarClock className="size-4 shrink-0 text-muted-foreground" aria-hidden /> {note}
        </p>
      ))}
      {paid && (
        <div className="flex flex-wrap gap-2">
          {cancelAtPeriodEnd ? (
            <Button variant="secondary" size="sm" loading={pending} onClick={() => run(() => setCancelAtPeriodEnd(false))}>
              {t("manage.resume")}
            </Button>
          ) : (
            <>
              {plan === "pro" && !scheduledPlan && (
                <Button variant="secondary" size="sm" disabled={pending} onClick={() => run(() => setScheduledDowngrade(true))}>
                  {t("manage.downgrade")}
                </Button>
              )}
              {isDowngrade && (
                <Button variant="secondary" size="sm" disabled={pending} onClick={() => run(() => setScheduledDowngrade(false))}>
                  {t("manage.undoDowngrade")}
                </Button>
              )}
              <Button variant="ghost" size="sm" className="text-destructive" onClick={() => setConfirmCancel(true)}>
                {t("manage.cancel")}
              </Button>
            </>
          )}
        </div>
      )}

      <Dialog open={confirmCancel} onOpenChange={setConfirmCancel}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("manage.cancelTitle")}</DialogTitle>
            <DialogDescription>{t("manage.cancelBody", { date: date(periodEnd) })}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="ghost">{t("manage.keep")}</Button>
            </DialogClose>
            <Button variant="destructive" loading={pending} onClick={() => run(() => setCancelAtPeriodEnd(true))}>
              {t("manage.cancelConfirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
