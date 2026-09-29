import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AssistantWorkspace } from "@/components/assistant/assistant-workspace";
import { requireAccount } from "@/lib/auth/account";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("assistant");
  return { title: t("title") };
}

export default async function Page() {
  const [account, t] = await Promise.all([requireAccount(), getTranslations("assistant")]);
  return (
    <div className="mx-auto flex h-[calc(100dvh-12rem)] max-w-5xl flex-col gap-4 lg:h-[calc(100dvh-9rem)]">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
          {t("title")}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>
      <AssistantWorkspace userName={account.profile.full_name || account.email} layout="page" />
    </div>
  );
}
