"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { AssistantProvider } from "@/components/assistant/assistant-context";
import { AssistantLauncher } from "@/components/assistant/assistant-launcher";
import { LogoMark } from "@/components/brand/logo";
import { AccessBanner } from "./access-banner";
import { AppSidebar } from "./app-sidebar";
import { CommandPalette } from "./command-palette";
import { MobileTabBar } from "./mobile-tab-bar";
import { TrialPill } from "./trial-pill";
import type { ShellAccount } from "./types";
import { UserMenu } from "./user-menu";

export function AppShell({ account, children }: { account: ShellAccount; children: ReactNode }) {
  const pathname = usePathname();
  // Éditeurs plein écran : signature, préparation d'une demande, signature en lot.
  const fullscreen =
    pathname.endsWith("/signer") ||
    pathname.endsWith("/demande") ||
    pathname.endsWith("/documents/lot") ||
    pathname.endsWith("/editer");
  return (
    <AssistantProvider pro={account.aiAdvanced} initialRemaining={account.aiRemaining}>
      {fullscreen ? (
        <main id="contenu" className="min-h-dvh">
          {children}
        </main>
      ) : (
        <ShellFrame account={account}>{children}</ShellFrame>
      )}
      <AssistantLauncher userName={account.name} fullscreenRoute={fullscreen} />
    </AssistantProvider>
  );
}

function ShellFrame({ account, children }: { account: ShellAccount; children: ReactNode }) {
  const tc = useTranslations("common");
  return (
    <div className="flex min-h-dvh">
      <AppSidebar account={account} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 border-b border-border bg-background/90 md:bg-background/70 md:backdrop-blur-xl">
          <div className="flex h-14 items-center justify-between gap-3 px-4 sm:px-6 lg:h-16">
            <Link href="/app" className="lg:hidden" aria-label={tc("dashboardLink")}>
              <LogoMark className="size-8" />
            </Link>
            <CommandPalette />
            <div className="flex items-center gap-2">
              <TrialPill account={account} />
              <UserMenu account={account} />
            </div>
          </div>
          <AccessBanner account={account} />
        </header>
        <main id="contenu" className="flex-1 px-4 pt-6 pb-28 sm:px-6 lg:px-10 lg:pt-10 lg:pb-12">
          {children}
        </main>
      </div>
      <MobileTabBar />
    </div>
  );
}
