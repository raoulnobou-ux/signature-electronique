import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js/min";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { PageHeader } from "@/components/app/page-header";
import { SubscriptionOverview } from "@/components/billing/subscription-overview";
import { requireAccount } from "@/lib/auth/account";
import { createClient } from "@/lib/supabase/server";
import type { AccountType } from "@/lib/validation/auth";
import { hasPassword } from "@/lib/auth/reauth";
import { describeDevice } from "@/lib/requests/device";
import { SettingsView, type SecurityInfo, type SettingsProfile } from "./settings-view";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("app.settings");
  return { title: t("metaTitle") };
}

export default async function SettingsPage() {
  const [account, t, supabase] = await Promise.all([
    requireAccount(),
    getTranslations("app.settings"),
    createClient(),
  ]);
  const [{ data: factors }, { data: userData }, { data: sessionRows }] = await Promise.all([
    supabase.auth.mfa.listFactors(),
    supabase.auth.getUser(),
    supabase.rpc("my_sessions"),
  ]);
  const user = userData.user;
  // Sessions actives (lecture seule, ses propres sessions) : appareil résumé, jamais de jeton.
  const security: SecurityInfo = {
    hasPassword: user ? hasPassword(user) : false,
    lastSignInAt: user?.last_sign_in_at ?? null,
    sessions: (sessionRows ?? []).map((s) => ({
      id: s.id,
      device: describeDevice(s.user_agent),
      ip: s.ip,
      lastActiveAt: s.last_active_at,
      current: s.current,
    })),
  };
  const twoFactorEnabled = Boolean(factors?.totp.some((f) => f.status === "verified"));
  const p = account.profile;
  const phone = p.phone ? parsePhoneNumberFromString(p.phone) : undefined;

  const profile: SettingsProfile = {
    fullName: p.full_name,
    email: account.email,
    phoneNational: phone?.formatNational() ?? "",
    phoneCountry: (phone?.country as CountryCode | undefined) ?? null,
    avatarUrl: p.avatar_url,
    timezone: p.timezone,
    country: p.country,
    currency: p.currency,
    accountType: (p.account_type as AccountType | null) ?? null,
    orgName: p.org_name ?? "",
    orgSector: p.org_sector ?? "",
    city: p.city ?? "",
    orgAddress: p.org_address ?? "",
    orgFooter: p.org_footer ?? "",
    emailNotifications: p.email_notifications,
  };

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title={t("title")} />
      <Suspense>
        <SettingsView
          profile={profile}
          billing={<SubscriptionOverview account={account} />}
          twoFactorEnabled={twoFactorEnabled}
          security={security}
        />
      </Suspense>
    </div>
  );
}
