import { ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ClientMessages } from "@/components/providers/client-messages";
import { HashChecker } from "@/components/verify/hash-checker";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("verify");
  return { title: t("metaTitle"), description: t("intro") };
}

/** Vérification d'un document signé : dépôt du fichier, comparaison d'empreinte. */
export default async function VerifyPage() {
  const t = await getTranslations("verify");
  return (
    <div className="mx-auto max-w-2xl px-4 py-16 sm:py-24">
      <div className="mb-10 space-y-3 text-center">
        <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-brand-gradient text-white shadow-lift">
          <ShieldCheck className="size-7" aria-hidden />
        </div>
        <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
          {t("title")}
        </h1>
        <p className="text-muted-foreground">{t("intro")}</p>
      </div>
      <ClientMessages namespaces={["verify"]}>
        <HashChecker />
      </ClientMessages>
    </div>
  );
}
