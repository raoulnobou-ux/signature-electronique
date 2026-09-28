"use client";

import { Download } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { toast } from "sonner";
import { getReceiptUrl } from "@/app/(app)/app/abonnement/actions";
import { Button } from "@/components/ui/button";

export function ReceiptButton({ paymentId, number }: { paymentId: string; number: string }) {
  const t = useTranslations("app.billing");
  const [pending, start] = useTransition();
  return (
    <Button
      variant="ghost"
      size="sm"
      loading={pending}
      aria-label={`${t("receipt")} ${number}`}
      onClick={() =>
        start(async () => {
          const result = await getReceiptUrl(paymentId);
          if (result.ok) window.location.assign(result.url);
          else toast.error(t(`errors.${result.reason}`));
        })
      }
    >
      <Download /> {t("receipt")}
    </Button>
  );
}
