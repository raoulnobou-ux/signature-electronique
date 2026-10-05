"use client";

import {
  Building2,
  CreditCard,
  Download,
  KeyRound,
  LogOut,
  Palette,
  ShieldAlert,
  Trash2,
  User,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { changeLocale } from "@/app/actions/locale";
import { LOCALE_NAMES } from "@/components/locale-switcher";
import { locales } from "@/i18n/config";
import { useTheme } from "next-themes";
import { useRef, useState, useTransition, type ReactNode } from "react";
import { toast } from "sonner";
import { FormField } from "@/components/auth/form-field";
import { PhoneInput } from "@/components/auth/phone-input";
import { TwoFactorCard } from "@/components/settings/two-factor-card";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input, Textarea } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CURRENCY_CODES } from "@/config/currencies";
import { countryOptions, DEFAULT_COUNTRY, isCountryCode, type CountryCode } from "@/lib/phone";
import { useIsClient } from "@/lib/use-is-client";
import { cn } from "@/lib/utils";
import { ACCOUNT_TYPES, type AccountType } from "@/lib/validation/auth";
import {
  deleteAccount,
  removeAvatar,
  sendPasswordChangeLink,
  signOutEverywhere,
  updateOrganization,
  updatePreferences,
  updateProfile,
  uploadAvatar,
  type SettingsResult,
} from "./actions";

export type SettingsProfile = {
  fullName: string;
  email: string;
  phoneNational: string;
  phoneCountry: CountryCode | null;
  avatarUrl: string | null;
  timezone: string;
  /** Pays de résidence (ISO alpha-2) et devise préférée, ou null. */
  country: string | null;
  currency: string | null;
  accountType: AccountType | null;
  orgName: string;
  orgSector: string;
  city: string;
  orgAddress: string;
  orgFooter: string;
  emailNotifications: boolean;
};

const TABS = [
  "profil",
  "structure",
  "abonnement",
  "securite",
  "preferences",
  "zone-sensible",
] as const;
type Tab = (typeof TABS)[number];

export function SettingsView({
  profile,
  billing,
  twoFactorEnabled,
}: {
  profile: SettingsProfile;
  billing: ReactNode;
  twoFactorEnabled: boolean;
}) {
  const t = useTranslations("app.settings");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const requested = searchParams.get("onglet") as Tab | null;
  const tab: Tab = requested && TABS.includes(requested) ? requested : "profil";

  const tabs: { value: Tab; label: string; icon: typeof User }[] = [
    { value: "profil", label: t("tabs.profile"), icon: User },
    { value: "structure", label: t("tabs.organization"), icon: Building2 },
    { value: "abonnement", label: t("tabs.billing"), icon: CreditCard },
    { value: "securite", label: t("tabs.security"), icon: KeyRound },
    { value: "preferences", label: t("tabs.preferences"), icon: Palette },
    { value: "zone-sensible", label: t("tabs.danger"), icon: ShieldAlert },
  ];

  return (
    <Tabs
      value={tab}
      onValueChange={(value) => router.replace(`${pathname}?onglet=${value}`, { scroll: false })}
      className="grid gap-6 lg:grid-cols-[220px_1fr]"
    >
      <div className="-mx-4 overflow-x-auto px-4 lg:mx-0 lg:overflow-visible lg:px-0">
        <TabsList className="w-max lg:w-full lg:flex-col lg:items-stretch lg:rounded-2xl lg:p-1.5">
          {tabs.map(({ value, label, icon: Icon }) => (
            <TabsTrigger key={value} value={value} className="lg:justify-start">
              <Icon aria-hidden />
              {label}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>

      <div className="min-w-0">
        <TabsContent value="profil" className="mt-0">
          <ProfileTab profile={profile} />
        </TabsContent>
        <TabsContent value="structure" className="mt-0">
          <OrganizationTab profile={profile} />
        </TabsContent>
        <TabsContent value="abonnement" className="mt-0">
          {billing}
        </TabsContent>
        <TabsContent value="securite" className="mt-0">
          <SecurityTab twoFactorEnabled={twoFactorEnabled} />
        </TabsContent>
        <TabsContent value="preferences" className="mt-0">
          <PreferencesTab profile={profile} />
        </TabsContent>
        <TabsContent value="zone-sensible" className="mt-0">
          <DangerTab />
        </TabsContent>
      </div>
    </Tabs>
  );
}

function useSave() {
  const t = useTranslations("app.settings");
  const tv = useTranslations("validation");
  const [pending, startTransition] = useTransition();
  const run = (action: () => Promise<SettingsResult>, onDone?: () => void) =>
    startTransition(async () => {
      const result = await action();
      if (result.ok) {
        toast.success(t("saved"));
        onDone?.();
      } else if (result.error === "phone") toast.error(tv("phone"));
      else if (result.error === "avatar") toast.error(t("profile.avatarError"));
      else toast.error(t("saveError"));
    });
  return { pending, run };
}

function ProfileTab({ profile }: { profile: SettingsProfile }) {
  const t = useTranslations("app.settings");
  const tAuth = useTranslations("auth.fields");
  const router = useRouter();
  const { pending, run } = useSave();
  const fileRef = useRef<HTMLInputElement>(null);
  const [fullName, setFullName] = useState(profile.fullName);
  const [country, setCountry] = useState<CountryCode>(
    profile.phoneCountry ??
      (isCountryCode(profile.country) ? profile.country : null) ??
      DEFAULT_COUNTRY,
  );
  const [residence, setResidence] = useState(profile.country ?? "");
  const [currency, setCurrency] = useState(profile.currency ?? "");
  const isClient = useIsClient();
  const [phone, setPhone] = useState(profile.phoneNational);
  const [timezone, setTimezone] = useState(profile.timezone);
  const locale = useLocale();
  const [switching, switchLocale] = useTransition();
  const timezones =
    typeof Intl.supportedValuesOf === "function"
      ? Intl.supportedValuesOf("timeZone")
      : [profile.timezone];

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("profile.title")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center gap-4">
          <Avatar name={fullName || profile.email} src={profile.avatarUrl} size="lg" />
          <div className="space-y-2">
            <p className="text-sm font-medium">{t("profile.avatar")}</p>
            <div className="flex gap-2">
              <input
                ref={fileRef}
                type="file"
                data-testid="avatar-input"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const data = new FormData();
                  data.append("file", file);
                  run(
                    () => uploadAvatar(data),
                    () => router.refresh(),
                  );
                  e.target.value = "";
                }}
              />
              <Button
                size="sm"
                variant="secondary"
                onClick={() => fileRef.current?.click()}
                loading={pending}
              >
                {t("profile.changeAvatar")}
              </Button>
              {profile.avatarUrl && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => run(removeAvatar, () => router.refresh())}
                >
                  {t("profile.removeAvatar")}
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">{t("profile.avatarHint")}</p>
          </div>
        </div>

        <form
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            run(
              () => updateProfile({ fullName, country, phone, timezone, residence, currency }),
              () => router.refresh(),
            );
          }}
        >
          <div className="grid gap-5 sm:grid-cols-2">
            <FormField id="fullName" label={tAuth("fullName")}>
              <Input
                id="fullName"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                autoComplete="name"
              />
            </FormField>
            <FormField id="email" label={t("profile.email")} hint={t("profile.emailHint")}>
              <Input id="email" value={profile.email} disabled readOnly />
            </FormField>
          </div>
          <FormField id="phone" label={tAuth("phone")}>
            <PhoneInput
              id="phone"
              countryLabel={tAuth("country")}
              country={country}
              onCountryChange={setCountry}
              value={phone}
              onValueChange={setPhone}
            />
          </FormField>
          <div className="grid gap-5 sm:grid-cols-2">
            <FormField id="residence" label={t("profile.country")} hint={t("profile.countryHint")}>
              <select
                id="residence"
                value={residence}
                onChange={(e) => setResidence(e.target.value)}
                className="h-11 w-full rounded-xl border border-input bg-background-elevated/60 px-3 text-base sm:text-sm"
              >
                <option value="">{t("profile.countryUnset")}</option>
                {/* Noms des pays selon les données ICU du navigateur (affichés côté client). */}
                {(isClient
                  ? countryOptions(locale, profile.country)
                  : countryOptions(locale, profile.country).filter((c) => c.code === residence)
                ).map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.name}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField id="currency" label={t("profile.currency")} hint={t("profile.currencyHint")}>
              <select
                id="currency"
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="h-11 w-full rounded-xl border border-input bg-background-elevated/60 px-3 text-base sm:text-sm"
              >
                <option value="">{t("profile.currencyAuto")}</option>
                {CURRENCY_CODES.map((code) => (
                  <option key={code} value={code}>
                    {code === "XAF" ? "FCFA (XAF)" : code}
                  </option>
                ))}
              </select>
            </FormField>
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            <FormField id="timezone" label={t("profile.timezone")}>
              <select
                id="timezone"
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                className="h-11 w-full rounded-xl border border-input bg-background-elevated/60 px-3 text-base sm:text-sm"
              >
                {timezones.map((tz) => (
                  <option key={tz} value={tz}>
                    {tz.replace(/_/g, " ")}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField id="language" label={t("profile.language")} hint={t("profile.languageSoon")}>
              <select
                id="language"
                value={locale}
                disabled={switching}
                onChange={(e) =>
                  switchLocale(async () => {
                    await changeLocale(e.target.value);
                    router.refresh();
                  })
                }
                className="h-11 w-full rounded-xl border border-input bg-background-elevated/60 px-3 text-base sm:text-sm"
              >
                {locales.map((l) => (
                  <option key={l} value={l} lang={l}>
                    {LOCALE_NAMES[l]}
                  </option>
                ))}
              </select>
            </FormField>
          </div>
          <Button type="submit" loading={pending}>
            {t("save")}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function OrganizationTab({ profile }: { profile: SettingsProfile }) {
  const t = useTranslations("app.settings");
  const tAuth = useTranslations("auth");
  const { pending, run } = useSave();
  const [values, setValues] = useState({
    accountType: profile.accountType,
    orgName: profile.orgName,
    orgSector: profile.orgSector,
    city: profile.city,
    orgAddress: profile.orgAddress,
    orgFooter: profile.orgFooter,
  });
  const set = (key: keyof typeof values) => (e: { target: { value: string } }) =>
    setValues((v) => ({ ...v, [key]: e.target.value }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("organization.title")}</CardTitle>
        <CardDescription>{t("organization.subtitle")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => updateOrganization(values));
          }}
        >
          <fieldset className="space-y-2">
            <legend className="mb-2 text-sm font-medium">{tAuth("fields.accountType")}</legend>
            <div role="radiogroup" className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {ACCOUNT_TYPES.map((type) => (
                <button
                  key={type}
                  type="button"
                  role="radio"
                  aria-checked={values.accountType === type}
                  onClick={() =>
                    setValues((v) => ({ ...v, accountType: v.accountType === type ? null : type }))
                  }
                  className={cn(
                    "min-h-11 cursor-pointer rounded-xl border px-3 py-2 text-sm transition-all",
                    values.accountType === type
                      ? "border-transparent bg-brand-gradient text-white"
                      : "border-border bg-background-elevated/60 hover:border-ring/40",
                  )}
                >
                  {tAuth(`accountTypes.${type}`)}
                </button>
              ))}
            </div>
          </fieldset>
          <FormField id="orgName" label={tAuth("fields.orgName")}>
            <Input
              id="orgName"
              value={values.orgName}
              onChange={set("orgName")}
              placeholder={tAuth("fields.orgNamePlaceholder")}
            />
          </FormField>
          <div className="grid gap-5 sm:grid-cols-2">
            <FormField id="orgSector" label={tAuth("fields.orgSector")}>
              <Input id="orgSector" value={values.orgSector} onChange={set("orgSector")} />
            </FormField>
            <FormField id="city" label={tAuth("fields.city")}>
              <Input id="city" value={values.city} onChange={set("city")} />
            </FormField>
          </div>
          <FormField id="orgAddress" label={t("organization.address")}>
            <Input
              id="orgAddress"
              value={values.orgAddress}
              onChange={set("orgAddress")}
              autoComplete="street-address"
            />
          </FormField>
          <FormField id="orgFooter" label={t("organization.footer")}>
            <Textarea
              id="orgFooter"
              rows={2}
              value={values.orgFooter}
              onChange={set("orgFooter")}
              placeholder={t("organization.footerPlaceholder")}
            />
          </FormField>
          <Button type="submit" loading={pending}>
            {t("save")}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function SecurityTab({ twoFactorEnabled }: { twoFactorEnabled: boolean }) {
  const t = useTranslations("app.settings.security");
  const tAuth = useTranslations("auth");
  const [pending, startTransition] = useTransition();
  const [signingOut, startSignOut] = useTransition();

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>{t("passwordTitle")}</CardTitle>
          <CardDescription>{t("passwordBody")}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            variant="secondary"
            loading={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await sendPasswordChangeLink();
                if (result.ok) toast.success(t("passwordSent"));
                else
                  toast.error(
                    result.error === "rate_limited" ? tAuth("rateLimited") : tAuth("genericError"),
                  );
              })
            }
          >
            <KeyRound /> {t("passwordCta")}
          </Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t("sessionsTitle")}</CardTitle>
          <CardDescription>{t("sessionsBody")}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            variant="secondary"
            loading={signingOut}
            onClick={() => startSignOut(() => signOutEverywhere())}
          >
            <LogOut /> {t("signOutAll")}
          </Button>
        </CardContent>
      </Card>
      <TwoFactorCard enabled={twoFactorEnabled} />
    </div>
  );
}

function PreferencesTab({ profile }: { profile: SettingsProfile }) {
  const t = useTranslations("app.settings.preferences");
  const { resolvedTheme, setTheme } = useTheme();
  const [notifications, setNotifications] = useState(profile.emailNotifications);

  const chooseTheme = (theme: "dark" | "light") => {
    setTheme(theme);
    void updatePreferences({ theme });
  };

  return (
    <Card>
      <CardContent className="space-y-8">
        <div className="space-y-3">
          <p className="text-sm font-medium">{t("theme")}</p>
          <div
            role="radiogroup"
            aria-label={t("theme")}
            className="grid max-w-md grid-cols-2 gap-3"
          >
            {(["dark", "light"] as const).map((theme) => (
              <button
                key={theme}
                type="button"
                role="radio"
                aria-checked={resolvedTheme === theme}
                onClick={() => chooseTheme(theme)}
                className={cn(
                  "cursor-pointer overflow-hidden rounded-2xl border text-left transition-all",
                  resolvedTheme === theme
                    ? "border-ring ring-4 ring-ring/20"
                    : "border-border hover:border-ring/40",
                )}
              >
                <div className={cn("h-20 p-3", theme === "dark" ? "bg-[#07090F]" : "bg-[#F6F7FB]")}>
                  <div className="h-2 w-16 rounded-full bg-brand-gradient" />
                  <div
                    className={cn(
                      "mt-2 h-2 w-24 rounded-full",
                      theme === "dark" ? "bg-white/15" : "bg-slate-300",
                    )}
                  />
                  <div
                    className={cn(
                      "mt-1.5 h-2 w-20 rounded-full",
                      theme === "dark" ? "bg-white/10" : "bg-slate-200",
                    )}
                  />
                </div>
                <p className="px-3 py-2 text-sm font-medium">
                  {theme === "dark" ? t("themeDark") : t("themeLight")}
                </p>
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-start justify-between gap-6">
          <div>
            <label htmlFor="notifications" className="text-sm font-medium">
              {t("notifications")}
            </label>
            <p className="text-sm text-muted-foreground">{t("notificationsBody")}</p>
          </div>
          <Switch
            id="notifications"
            checked={notifications}
            onCheckedChange={(checked) => {
              setNotifications(checked);
              void updatePreferences({ emailNotifications: checked });
            }}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function DangerTab() {
  const t = useTranslations("app.settings.danger");
  const tCommon = useTranslations("common");
  const [confirm, setConfirm] = useState("");
  const [pending, startTransition] = useTransition();

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>{t("exportTitle")}</CardTitle>
          <CardDescription>{t("exportBody")}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="secondary">
            <Link href="/api/account/export" prefetch={false}>
              <Download /> {t("exportCta")}
            </Link>
          </Button>
        </CardContent>
      </Card>
      <Card className="border-destructive/30">
        <CardHeader>
          <CardTitle className="text-destructive">{t("deleteTitle")}</CardTitle>
          <CardDescription>{t("deleteBody")}</CardDescription>
        </CardHeader>
        <CardContent>
          <Dialog onOpenChange={() => setConfirm("")}>
            <DialogTrigger asChild>
              <Button variant="destructive">
                <Trash2 /> {t("deleteCta")}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t("deleteConfirmTitle")}</DialogTitle>
                <DialogDescription>{t("deleteConfirmBody")}</DialogDescription>
              </DialogHeader>
              <Input
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder={t("deleteConfirmWord")}
                aria-label={t("deleteConfirmBody")}
                autoComplete="off"
              />
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="ghost">{tCommon("cancel")}</Button>
                </DialogClose>
                <Button
                  variant="destructive"
                  disabled={confirm !== t("deleteConfirmWord")}
                  loading={pending}
                  onClick={() =>
                    startTransition(async () => {
                      const result = await deleteAccount(confirm);
                      if (result && !result.ok) toast.error(t("deleteError"));
                    })
                  }
                >
                  {t("deleteConfirmCta")}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>
    </div>
  );
}
