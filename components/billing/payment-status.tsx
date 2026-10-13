"use client";

import { CheckCircle2, RotateCcw, Smartphone, TimerOff, XCircle } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { checkPayment } from "@/app/(app)/app/abonnement/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import type { FailureKind } from "@/lib/billing/failure";
import { cn } from "@/lib/utils";

type State = { status: "pending" | "successful" | "failed"; failure: FailureKind | null };
type ViewKey = "pending" | "success" | "timeout" | `failed.${FailureKind}`;

/** Intervalle et durée de la vérification automatique. */
const POLL_MS = 5_000;
const MAX_WAIT_MS = 3 * 60_000;

/**
 * État d'un paiement après le retour de Notch Pay : attente (le client valide sur son
 * téléphone), puis succès, échec avec sa cause, ou délai dépassé avec « Réessayer ».
 */
export function PaymentStatus({
  reference,
  hint,
  initial,
  summary,
}: {
  reference: string;
  hint: string | null;
  initial: State;
  summary: { description: string; amount: string };
}) {
  const t = useTranslations("app.billing.paymentPage");
  const [state, setState] = useState<State>(initial);
  const [elapsed, setElapsed] = useState(0);
  /** Début de l'attente, fixé au premier passage de l'effet (jamais pendant le rendu). */
  const started = useRef<number | null>(null);

  const waiting = state.status === "pending";
  const timedOut = waiting && elapsed >= MAX_WAIT_MS;

  useEffect(() => {
    if (!waiting || timedOut) return;
    started.current ??= Date.now();
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      const result = await checkPayment({ reference, hint }).catch(() => null);
      if (cancelled) return;
      if (result?.ok) setState({ status: result.status, failure: result.failure });
      setElapsed(Date.now() - (started.current ?? Date.now()));
    }, POLL_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [waiting, timedOut, elapsed, reference, hint]);

  const view: { key: ViewKey; icon: typeof XCircle; tone: string } = timedOut
    ? { key: "timeout", icon: TimerOff, tone: "text-warning" }
    : state.status === "successful"
      ? { key: "success", icon: CheckCircle2, tone: "text-success" }
      : state.status === "failed"
        ? {
            key: `failed.${state.failure ?? "declined"}`,
            icon: XCircle,
            tone: "text-destructive",
          }
        : { key: "pending", icon: Smartphone, tone: "text-primary" };

  return (
    <Card>
      <CardContent className="space-y-6 p-6 sm:p-8">
        <div role="status" aria-live="polite" className="space-y-3 text-center">
          <view.icon
            className={cn(
              "mx-auto size-12",
              view.tone,
              waiting && !timedOut && "motion-safe:animate-pulse",
            )}
            aria-hidden
          />
          <h1 className="font-display text-2xl font-semibold">{t(`${view.key}.title`)}</h1>
          <p className="text-muted-foreground">{t(`${view.key}.body`)}</p>
        </div>

        {waiting && !timedOut && (
          <Progress
            value={(elapsed / MAX_WAIT_MS) * 100}
            aria-label={t("pending.progress")}
            className="h-1.5"
          />
        )}

        <dl className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-secondary/40 px-4 py-3 text-sm">
          <dt className="text-muted-foreground">{summary.description}</dt>
          <dd className="font-semibold tabular-nums">{summary.amount}</dd>
        </dl>

        <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
          {state.status === "successful" ? (
            <Button asChild>
              <Link href="/app">{t("actions.dashboard")}</Link>
            </Button>
          ) : (
            (state.status === "failed" || timedOut) && (
              <Button asChild>
                <Link href="/app/abonnement#plans">
                  <RotateCcw /> {t("actions.retry")}
                </Link>
              </Button>
            )
          )}
          <Button asChild variant="ghost">
            <Link href="/app/abonnement">{t("actions.billing")}</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
