import { Check } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { AmbientBackground } from "@/components/brand/ambient-background";
import { Logo } from "@/components/brand/logo";
import { ClientMessages } from "@/components/providers/client-messages";
import { ThemeToggle } from "@/components/theme-toggle";

export default async function AuthLayout({ children }: LayoutProps<"/">) {
  const t = await getTranslations("auth.side");
  const points = t.raw("points") as string[];

  return (
    <div className="grid min-h-dvh lg:grid-cols-[1fr_1.1fr]">
      {/* Panneau de marque (bureau) */}
      <aside className="relative isolate hidden overflow-hidden border-r border-border lg:flex lg:flex-col lg:justify-between lg:p-12">
        <AmbientBackground grid />
        <Link href="/" aria-label="QuickSign — accueil" className="w-fit">
          <Logo />
        </Link>
        <div className="max-w-md space-y-8">
          <h2 className="font-display text-4xl leading-tight font-semibold tracking-tight">
            {t("title")}
          </h2>
          <ul className="space-y-3">
            {points.map((point) => (
              <li key={point} className="flex items-center gap-3 text-muted-foreground">
                <span className="flex size-6 items-center justify-center rounded-full bg-brand-gradient text-white">
                  <Check className="size-3.5" strokeWidth={3} aria-hidden />
                </span>
                {point}
              </li>
            ))}
          </ul>
        </div>
        <p className="font-display text-lg text-muted-foreground">« {t("quote")} »</p>
      </aside>

      {/* Formulaire */}
      <div className="relative isolate flex flex-col">
        <div className="lg:hidden">
          <AmbientBackground intensity="subtle" />
        </div>
        <header className="flex items-center justify-between p-4 sm:p-6">
          <Link href="/" aria-label="QuickSign — accueil" className="lg:invisible">
            <Logo />
          </Link>
          <ThemeToggle />
        </header>
        <main
          id="contenu"
          className="flex flex-1 items-start justify-center px-4 pb-12 sm:items-center sm:px-6"
        >
          <div className="w-full max-w-md">
            <ClientMessages namespaces={["auth"]}>{children}</ClientMessages>
          </div>
        </main>
      </div>
    </div>
  );
}
