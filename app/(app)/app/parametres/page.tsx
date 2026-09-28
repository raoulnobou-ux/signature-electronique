import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js/min";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { PageHeader } from "@/components/app/page-header";
import { SubscriptionOverview } from "@/components/billing/subscription-overview";
import { requireAccount } from "@/lib/auth/account";
import type { AccountType } from "@/lib/validation/auth";
import { SettingsView, type SettingsProfile } from "./settings-view";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("app.settings");
  return { title: t("metaTitle") };
}

export default async function SettingsPage() {
  const [account, t] = await Promise.all([requireAccount(), getTranslations("app.settings")]);
  const p = account.profile;
  const phone = p.phone ? parsePhoneNumberFromString(p.phone) : undefined;

  const profile: SettingsProfile = {
    fullName: p.full_name,
    email: account.email,
    phoneNational: phone?.formatNational() ?? "",
    phoneCountry: (phone?.country as CountryCode | undefined) ?? null,
    avatarUrl: p.avatar_url,
    timezone: p.timezone,
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
        <SettingsView profile={profile} billing={<SubscriptionOverview account={account} />} />
      </Suspense>
    </div>
  );
}
