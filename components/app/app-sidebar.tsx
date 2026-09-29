"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Logo } from "@/components/brand/logo";
import { Badge } from "@/components/ui/badge";
import { isActive, NAV_ITEMS, SECONDARY_NAV, type NavItem } from "@/lib/navigation";
import { cn } from "@/lib/utils";
import { TrialCard } from "./trial-card";
import type { ShellAccount } from "./types";

function NavLink({
  item,
  pathname,
  showPro,
}: {
  item: NavItem;
  pathname: string;
  showPro: boolean;
}) {
  const t = useTranslations("app.nav");
  const active = isActive(pathname, item.href);
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      data-tour={item.key}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group relative flex h-10 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors",
        active
          ? "bg-accent text-foreground"
          : "text-muted-foreground hover:bg-secondary hover:text-foreground",
      )}
    >
      {active && (
        <span
          className="absolute top-2 bottom-2 left-0 w-0.5 rounded-full bg-brand-gradient"
          aria-hidden
        />
      )}
      <Icon className={cn("size-[18px]", active && "text-accent-foreground")} aria-hidden />
      <span className="flex-1 truncate">{t(item.key)}</span>
      {item.pro && showPro && (
        <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
          {t("pro")}
        </Badge>
      )}
    </Link>
  );
}

export function AppSidebar({ account }: { account: ShellAccount }) {
  const tc = useTranslations("common");
  const pathname = usePathname();
  const t = useTranslations("app.nav");
  // Le badge « Pro » n'est utile que si l'utilisateur n'a pas (ou plus) accès au Pro.
  const showPro = account.effectivePlan !== "pro";

  return (
    <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-border bg-background-elevated/40 lg:flex">
      <div className="flex h-16 items-center px-5">
        <Link href="/app" aria-label={tc("dashboardLink")}>
          <Logo />
        </Link>
      </div>
      <nav
        aria-label={t("mainNav")}
        className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 py-2"
      >
        {NAV_ITEMS.map((item) => (
          <NavLink key={item.key} item={item} pathname={pathname} showPro={showPro} />
        ))}
        <div className="my-3 h-px bg-border" />
        {SECONDARY_NAV.map((item) => (
          <NavLink key={item.key} item={item} pathname={pathname} showPro={showPro} />
        ))}
      </nav>
      <div className="p-3">
        <TrialCard account={account} />
      </div>
    </aside>
  );
}
