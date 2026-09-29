"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { toast } from "sonner";
import { acceptInvitation } from "@/app/(app)/app/equipe/actions";
import { Button } from "@/components/ui/button";

export function AcceptInvitation({ token }: { token: string }) {
  const t = useTranslations("team.invitation");
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      size="lg"
      className="mt-6 w-full"
      loading={pending}
      onClick={() =>
        start(async () => {
          const result = await acceptInvitation(token);
          if (result.ok) {
            toast.success(t("joined"));
            router.push("/app/equipe");
          } else toast.error(t(`errors.${result.error}`));
        })
      }
    >
      {t("accept")}
    </Button>
  );
}
