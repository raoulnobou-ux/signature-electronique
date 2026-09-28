import type { Metadata } from "next";
import { AppShell } from "@/components/app/app-shell";
import type { ShellAccount } from "@/components/app/types";
import { AppShellProviders } from "@/components/providers/app-shell-providers";
import { ClientMessages } from "@/components/providers/client-messages";
import { requireAccount } from "@/lib/auth/account";

export const metadata: Metadata = {
  title: { default: "Mon espace", template: "%s · QuickSign" },
  robots: { index: false, follow: false },
};

export default async function AppLayout({ children }: LayoutProps<"/app">) {
  const account = await requireAccount();
  const ent = account.entitlements;

  const shellAccount: ShellAccount = {
    name: account.profile.full_name || account.email,
    email: account.email,
    avatarUrl: account.profile.avatar_url,
    state: ent.state,
    effectivePlan: ent.effectivePlan,
    subscriptionPlan: ent.subscriptionPlan,
    trialDaysRemaining: ent.trialDaysRemaining,
    periodEndsAt: ent.periodEndsAt.toISOString(),
    graceEndsAt: ent.graceEndsAt?.toISOString() ?? null,
  };

  return (
    <ClientMessages namespaces={["app", "auth", "documents", "signatures", "editor", "requests", "templates", "team"]}>
      <AppShellProviders>
        <AppShell account={shellAccount}>{children}</AppShell>
      </AppShellProviders>
    </ClientMessages>
  );
}
