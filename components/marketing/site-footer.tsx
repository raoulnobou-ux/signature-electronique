import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Mail } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { SocialLink } from "@/components/brand/social-link";
import { SOCIAL_ICON_PATHS } from "@/components/brand/social-icons";
import { SOCIAL_LINKS, SUPPORT_EMAIL, whatsappLink } from "@/config/social-links";
import { LocaleSwitcher } from "@/components/locale-switcher";

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
        { href: "/contact", label: t("nav.contact") },
        { href: "/connexion", label: t("common.signIn") },
      ],
    },
    {
      title: t("footer.legal"),
      links: [
        { href: "/cgu", label: t("footer.terms") },
        { href: "/confidentialite", label: t("footer.privacy") },
        { href: "/cookies", label: t("footer.cookies") },
        { href: "/mentions-legales", label: t("footer.legalNotice") },
        { href: "/securite", label: t("footer.securityPrivacy") },
        { href: "/securite#validite-juridique", label: t("footer.legalValidity") },
      ],
    },
  ];

  const whatsapp = whatsappLink(t("footer.whatsappMessage"));
  const socials = SOCIAL_LINKS.filter((s) => s.href);

  return (
    <footer className="border-t border-border/60">
      <div className="mx-auto grid max-w-6xl grid-cols-2 gap-x-6 gap-y-10 px-4 py-14 sm:px-6 md:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div className="col-span-2 space-y-4 md:col-span-1">
          <Logo />
          <p className="max-w-xs text-sm text-muted-foreground">{t("footer.about")}</p>
          <a
            href={`mailto:${SUPPORT_EMAIL}`}
            className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <Mail className="size-4" aria-hidden />
            {SUPPORT_EMAIL}
          </a>
          {whatsapp && (
            <a
              href={whatsapp}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-full border border-border/70 px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:border-success/50 hover:text-foreground"
            >
              <svg
                viewBox="0 0 24 24"
                className="size-4 text-success"
                fill="currentColor"
                aria-hidden
              >
                <path d={SOCIAL_ICON_PATHS.whatsapp} />
              </svg>
              {t("footer.whatsapp")}
            </a>
          )}
          {socials.length > 0 && (
            <ul className="flex flex-wrap gap-2 pt-1" aria-label={t("footer.follow")}>
              {socials.map((s) => (
                <li key={s.id}>
                  <SocialLink icon={s.id} label={s.label} href={s.href} />
                </li>
              ))}
            </ul>
          )}
        </div>
        {columns.map((col) => (
          <div key={col.title}>
            <h2 className="mb-3 font-sans text-sm font-semibold tracking-normal">{col.title}</h2>
            <ul className="space-y-2.5">
              {col.links.map((link) => (
                <li key={`${link.href}-${link.label}`}>
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
          <LocaleSwitcher className="text-xs" />
        </div>
      </div>
    </footer>
  );
}
