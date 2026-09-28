import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Logo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { getSessionUserId } from "@/lib/auth/session";
import { MobileNav } from "./mobile-nav";

export async function SiteHeader() {
  const t = await getTranslations();
  const signedIn = Boolean(await getSessionUserId());

  const links = [
    { href: "/#fonctionnalites", label: t("nav.features") },
    { href: "/#comment-ca-marche", label: t("nav.howItWorks") },
    { href: "/tarifs", label: t("nav.pricing") },
    { href: "/securite", label: t("nav.security") },
    { href: "/#faq", label: t("nav.faq") },
  ];

  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/90 md:bg-background/60 md:backdrop-blur-xl">
      <a
        href="#contenu"
        className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50 focus:rounded-lg focus:bg-popover focus:px-3 focus:py-2"
      >
        {t("common.skipToContent")}
      </a>
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/" aria-label="QuickSign — accueil" className="rounded-lg">
          <Logo />
        </Link>

        <nav aria-label="Navigation principale" className="hidden items-center gap-1 lg:flex">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-1.5">
          <ThemeToggle />
          {signedIn ? (
            <Button asChild size="sm" className="hidden sm:inline-flex">
              <Link href="/app">{t("nav.goToApp")}</Link>
            </Button>
          ) : (
            <>
              <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
                <Link href="/connexion">{t("common.signIn")}</Link>
              </Button>
              <Button asChild size="sm" className="hidden sm:inline-flex">
                <Link href="/inscription">{t("common.startTrial")}</Link>
              </Button>
            </>
          )}
          <MobileNav
            links={links}
            signedIn={signedIn}
            labels={{
              open: t("common.openMenu"),
              signIn: t("common.signIn"),
              startTrial: t("common.startTrial"),
              goToApp: t("nav.goToApp"),
            }}
          />
        </div>
      </div>
    </header>
  );
}
