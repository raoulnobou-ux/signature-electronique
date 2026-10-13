import { Check } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Logo } from "@/components/brand/logo";
import { ClientMessages } from "@/components/providers/client-messages";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { ThemeToggle } from "@/components/theme-toggle";

export default async function AuthLayout({ children }: LayoutProps<"/">) {
  const tc = await getTranslations("common");
  const t = await getTranslations("auth.side");
  const points = t.raw("points") as string[];

  return (
    <div className="grid min-h-dvh lg:grid-cols-[1fr_1.1fr]">
      {/* Panneau de marque (bureau) */}
      <aside className="hidden border-r border-border bg-muted lg:flex lg:flex-col lg:justify-between lg:p-12">
        <Link href="/" aria-label={tc("homeLink")} className="w-fit">
          <Logo />
        </Link>
        <div className="max-w-md space-y-8">
          <h2 className="font-display text-[2.1rem] leading-tight font-semibold tracking-tight text-balance">
            {t("title")}
          </h2>
          <ul className="space-y-3">
            {points.map((point) => (
              <li key={point} className="flex items-start gap-3 text-muted-foreground">
                <Check
                  className="mt-0.5 size-4 shrink-0 text-primary"
                  strokeWidth={2.5}
                  aria-hidden
                />
                {point}
              </li>
            ))}
          </ul>
        </div>
        <p className="text-sm text-muted-foreground">{t("footnote")}</p>
      </aside>

      {/* Formulaire */}
      <div className="flex flex-col">
        <header className="flex items-center justify-between p-4 sm:p-6">
          <Link href="/" aria-label={tc("homeLink")} className="lg:invisible">
            <Logo />
          </Link>
          <div className="flex items-center gap-2">
            <LocaleSwitcher className="text-xs" />
            <ThemeToggle />
          </div>
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
