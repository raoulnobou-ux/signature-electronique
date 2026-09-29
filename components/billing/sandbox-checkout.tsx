"use client";

import { CreditCard, Smartphone } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { completeSandboxPayment } from "@/app/(app)/app/abonnement/actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const METHODS = [
  { id: "mtn", icon: Smartphone },
  { id: "orange", icon: Smartphone },
  { id: "card", icon: CreditCard },
] as const;

export function SandboxCheckout({
  reference,
  amountLabel,
  cardOnly,
}: {
  reference: string;
  amountLabel: string;
  cardOnly: boolean;
}) {
  const t = useTranslations("app.billing");
  const methods = cardOnly ? METHODS.filter((m) => m.id === "card") : METHODS;
  const [method, setMethod] = useState<(typeof METHODS)[number]["id"]>(methods[0]!.id);
  const [pending, start] = useTransition();

  const submit = (outcome: "successful" | "failed") =>
    start(async () => {
      const result = await completeSandboxPayment({ reference, outcome, method });
      if (result.ok) window.location.assign(result.url);
      else toast.error(t(`errors.${result.reason}`));
    });

  return (
    <div className="space-y-5">
      <div role="radiogroup" aria-label={t("sandbox.method")} className="grid gap-2">
        {methods.map(({ id, icon: Icon }) => (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={method === id}
            onClick={() => setMethod(id)}
            className={cn(
              "flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 text-left text-sm font-medium transition-colors",
              method === id ? "border-brand-violet bg-accent" : "border-border hover:bg-secondary",
            )}
          >
            <Icon className="size-4" aria-hidden /> {t(`sandbox.methods.${id}`)}
          </button>
        ))}
      </div>
      <div className="grid gap-2">
        <Button size="lg" loading={pending} onClick={() => submit("successful")}>
          {t("sandbox.pay", { amount: amountLabel })}
        </Button>
        <Button variant="ghost" disabled={pending} onClick={() => submit("failed")}>
          {t("sandbox.fail")}
        </Button>
      </div>
    </div>
  );
}
