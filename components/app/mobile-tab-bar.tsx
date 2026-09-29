"use client";

import { FileText, LayoutDashboard, Menu, PenLine, Plus } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { isActive, NAV_ITEMS, SECONDARY_NAV } from "@/lib/navigation";
import { cn } from "@/lib/utils";

/** Barre de navigation inférieure (mobile), avec le bouton central « Signer ». */
export function MobileTabBar() {
  const pathname = usePathname();
  const t = useTranslations("app.nav");
  const [moreOpen, setMoreOpen] = useState(false);

  const tabs = [
    { key: "dashboard", href: "/app", label: t("home"), icon: LayoutDashboard },
    { key: "documents", href: "/app/documents", label: t("documents"), icon: FileText },
  ];
  const tabsRight = [
    { key: "signatures", href: "/app/signatures", label: t("signaturesShort"), icon: PenLine },
  ];
  const extra = [...NAV_ITEMS.slice(3), ...SECONDARY_NAV];

  const tabClass = (active: boolean) =>
    cn(
      "flex flex-1 flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors",
      active ? "text-foreground" : "text-muted-foreground",
    );

  return (
    <>
      <nav
        aria-label={t("mainNav")}
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 pb-safe lg:hidden"
      >
        <div className="flex h-16 items-stretch px-2">
          {tabs.map(({ key, href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              data-tour={key}
              className={tabClass(isActive(pathname, href))}
              aria-current={isActive(pathname, href) ? "page" : undefined}
            >
              <Icon className="size-5" aria-hidden />
              {label}
            </Link>
          ))}
          <div className="flex flex-1 items-center justify-center">
            <Link
              href="/app/documents?importer=1"
              aria-label={t("sign")}
              className="-mt-6 flex size-14 items-center justify-center rounded-2xl bg-brand-gradient text-white shadow-[0_10px_30px_-8px_rgb(99_102_241/0.8)] transition-transform active:scale-95"
            >
              <Plus className="size-6" strokeWidth={2.5} aria-hidden />
            </Link>
          </div>
          {tabsRight.map(({ key, href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              data-tour={key}
              className={tabClass(isActive(pathname, href))}
              aria-current={isActive(pathname, href) ? "page" : undefined}
            >
              <Icon className="size-5" aria-hidden />
              {label}
            </Link>
          ))}
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            data-tour="more"
            className={cn(tabClass(false), "cursor-pointer")}
          >
            <Menu className="size-5" aria-hidden />
            {t("more")}
          </button>
        </div>
      </nav>

      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent side="bottom" className="pb-safe">
          <SheetHeader>
            <SheetTitle>{t("more")}</SheetTitle>
          </SheetHeader>
          <div className="grid grid-cols-3 gap-2 p-4">
            {extra.map((item) => {
              const Icon = item.icon;
              const active = isActive(pathname, item.href);
              return (
                <Link
                  key={item.key}
                  href={item.href}
                  onClick={() => setMoreOpen(false)}
                  className={cn(
                    "flex min-h-24 flex-col items-center justify-center gap-2 rounded-2xl border p-3 text-center text-xs font-medium",
                    active ? "border-ring/40 bg-accent" : "border-border bg-secondary/50",
                  )}
                >
                  <Icon className="size-5 text-accent-foreground" aria-hidden />
                  {t(item.key)}
                </Link>
              );
            })}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
