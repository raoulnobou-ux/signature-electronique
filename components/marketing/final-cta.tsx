import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { AmbientBackground } from "@/components/brand/ambient-background";
import { Button } from "@/components/ui/button";

export async function FinalCta() {
  const t = await getTranslations("landing.finalCta");
  return (
    <section className="px-4 pb-20 sm:px-6 sm:pb-28">
      <div className="reveal gradient-border relative isolate mx-auto max-w-5xl overflow-hidden rounded-[2rem] px-6 py-16 text-center sm:px-12 sm:py-20">
        <AmbientBackground />
        <div className="absolute inset-0 -z-20 bg-background-elevated/80" />
        <h2 className="mx-auto max-w-2xl font-display text-3xl font-semibold tracking-tight text-balance sm:text-5xl">
          {t("title")}
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-muted-foreground sm:text-lg">{t("subtitle")}</p>
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <Button asChild size="lg">
            <Link href="/inscription">{t("cta")}</Link>
          </Button>
          <Button asChild size="lg" variant="secondary">
            <Link href="/tarifs">{t("secondary")}</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
