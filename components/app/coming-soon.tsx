import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "./page-header";

/** Section prévue dans une phase ultérieure : écran soigné plutôt qu'une page vide. */
export async function ComingSoon({ title, icon }: { title: string; icon: LucideIcon }) {
  const t = await getTranslations("app.comingSoon");
  return (
    <>
      <PageHeader title={title} />
      <EmptyState
        icon={icon}
        title={t("title")}
        description={t("body")}
        action={
          <Button asChild variant="secondary">
            <Link href="/app">{t("back")}</Link>
          </Button>
        }
      />
    </>
  );
}
