import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { AmbientBackground } from "@/components/brand/ambient-background";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";

export default async function NotFound() {
  const t = await getTranslations("notFound");
  return (
    <main className="relative isolate flex min-h-dvh flex-col items-center justify-center gap-6 px-4 text-center">
      <AmbientBackground grid intensity="subtle" />
      <Link href="/" aria-label="QuickSign — accueil">
        <Logo />
      </Link>
      <p className="text-gradient font-display text-8xl font-semibold sm:text-9xl">404</p>
      <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
        {t("title")}
      </h1>
      <p className="max-w-md text-muted-foreground">{t("description")}</p>
      <Button asChild size="lg">
        <Link href="/">{t("cta")}</Link>
      </Button>
    </main>
  );
}
