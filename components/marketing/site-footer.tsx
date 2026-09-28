import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Logo } from "@/components/brand/logo";

export async function SiteFooter() {
  const t = await getTranslations();
  const columns = [
    {
      title: t("footer.product"),
      links: [
        { href: "/#fonctionnalites", label: t("nav.features") },
        { href: "/tarifs", label: t("nav.pricing") },
        { href: "/#faq", label: t("nav.faq") },
        { href: "/inscription", label: t("common.startTrial") },
      ],
    },
    {
      title: t("footer.company"),
      links: [
        { href: "/securite", label: t("nav.security") },
        { href: "/contact", label: t("nav.contact") },
        { href: "/connexion", label: t("common.signIn") },
      ],
    },
    {
      title: t("footer.legal"),
      links: [
        { href: "/cgu", label: t("footer.terms") },
        { href: "/confidentialite", label: t("footer.privacy") },
        { href: "/mentions-legales", label: t("footer.legalNotice") },
        { href: "/securite#validite-juridique", label: t("footer.legalValidity") },
      ],
    },
  ];

  return (
    <footer className="border-t border-border/60">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div className="space-y-4">
          <Logo />
          <p className="max-w-xs text-sm text-muted-foreground">{t("footer.about")}</p>
        </div>
        {columns.map((col) => (
          <div key={col.title}>
            <h2 className="mb-3 font-sans text-sm font-semibold tracking-normal">{col.title}</h2>
            <ul className="space-y-2.5">
              {col.links.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-border/60">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-6 text-xs text-muted-foreground sm:flex-row sm:justify-between sm:px-6">
          <p>{t("footer.rights", { year: new Date().getFullYear() })}</p>
          <p>{t("footer.madeIn")}</p>
        </div>
      </div>
    </footer>
  );
}
