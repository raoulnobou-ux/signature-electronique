import Link from "next/link";
import { useTranslations } from "next-intl";
import { AmbientBackground } from "@/components/brand/ambient-background";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";

// Page d'accueil provisoire — remplacée par la landing page en Phase 2.
export default function HomePage() {
  const t = useTranslations("common");
  return (
    <main className="relative isolate flex min-h-dvh flex-col items-center justify-center gap-6 px-4 text-center">
      <AmbientBackground grid />
      <Logo />
      <h1 className="font-display text-4xl font-semibold tracking-tight sm:text-6xl">
        {t("tagline")}
      </h1>
      <Button asChild size="lg">
        <Link href="/design">Voir le design system</Link>
      </Button>
    </main>
  );
}
