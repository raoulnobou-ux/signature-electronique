"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, MailCheck } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect, useState, useTransition } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { FormField } from "@/components/auth/form-field";
import { GoogleButton } from "@/components/auth/google-button";
import { PasswordInput } from "@/components/auth/password-input";
import { PhoneInput } from "@/components/auth/phone-input";
import { useValidationMessage } from "@/components/auth/use-validation-message";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Stepper } from "@/components/ui/stepper";
import { type CountryCode } from "@/lib/phone";
import { cn } from "@/lib/utils";
import {
  ACCOUNT_TYPES,
  accountStepSchema,
  phoneOk,
  profileStepSchema,
  type AccountStepInput,
  type ProfileStepInput,
} from "@/lib/validation/auth";
import { resendConfirmation, signUp } from "../actions";

type Step = 0 | 1 | 2;

export function SignUpForm({ defaultCountry }: { defaultCountry: CountryCode }) {
  const t = useTranslations("auth");
  const tCommon = useTranslations("common");
  const v = useValidationMessage();
  const [step, setStep] = useState<Step>(0);
  const [formError, setFormError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string>("");
  const [pending, startTransition] = useTransition();

  const account = useForm<AccountStepInput>({
    resolver: zodResolver(
      accountStepSchema.refine((d) => phoneOk(d.phone, d.country), {
        path: ["phone"],
        message: "phone",
      }),
    ),
    mode: "onTouched",
    defaultValues: {
      fullName: "",
      email: "",
      country: defaultCountry,
      phone: "",
      password: "",
    },
  });
  const profile = useForm<ProfileStepInput>({ resolver: zodResolver(profileStepSchema) });
  const country = useWatch({ control: account.control, name: "country" }) as CountryCode;

  const submit = (profileValues: ProfileStepInput) => {
    setFormError(null);
    startTransition(async () => {
      const result = await signUp({
        ...account.getValues(),
        ...profileValues,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
      if (result.ok) {
        setSentTo(result.data.email);
        setStep(2);
        return;
      }
      if (result.error === "email_taken") {
        setStep(0);
        account.setError("email", { message: "email_taken" });
        return;
      }
      if (result.fieldErrors) {
        setStep(0);
        for (const [field, message] of Object.entries(result.fieldErrors)) {
          account.setError(field as keyof AccountStepInput, { message });
        }
        // L'erreur est affichée sous le champ concerné.
        return;
      }
      setFormError(result.error === "rate_limited" ? t("rateLimited") : t("genericError"));
    });
  };

  const steps = t.raw("signUp.steps") as string[];

  return (
    <div className="space-y-8">
      <div className="space-y-5">
        <Stepper steps={steps} current={step} />
        {step < 2 && (
          <div className="space-y-1.5">
            <h1 className="font-display text-3xl font-semibold tracking-tight">
              {step === 0 ? t("signUp.title") : t("signUp.profileTitle")}
            </h1>
            <p className="text-muted-foreground">
              {step === 0 ? t("signUp.subtitle") : t("signUp.profileSubtitle")}
            </p>
          </div>
        )}
      </div>

      {formError && (
        <p
          role="alert"
          className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          {formError}
        </p>
      )}

      {step === 0 && (
        <div
          key="account"
          className="animate-in space-y-5 duration-300 fade-in slide-in-from-right-4"
        >
          <GoogleButton next="/app/bienvenue" onError={setFormError} />
          <form
            noValidate
            className="space-y-5"
            onSubmit={account.handleSubmit(() => {
              setFormError(null);
              setStep(1);
            })}
          >
            <FormField
              id="fullName"
              label={t("fields.fullName")}
              error={v(account.formState.errors.fullName?.message)}
            >
              <Input
                id="fullName"
                autoComplete="name"
                placeholder={t("fields.fullNamePlaceholder")}
                aria-invalid={!!account.formState.errors.fullName}
                {...account.register("fullName")}
              />
            </FormField>

            <FormField
              id="email"
              label={t("fields.email")}
              error={
                account.formState.errors.email?.message === "email_taken"
                  ? t("signUp.emailTaken")
                  : v(account.formState.errors.email?.message)
              }
            >
              <Input
                id="email"
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder={t("fields.emailPlaceholder")}
                aria-invalid={!!account.formState.errors.email}
                {...account.register("email")}
              />
            </FormField>

            <FormField
              id="phone"
              label={t("fields.phone")}
              hint={t("fields.phoneHint")}
              error={v(account.formState.errors.phone?.message)}
            >
              <Controller
                control={account.control}
                name="phone"
                render={({ field }) => (
                  <PhoneInput
                    id="phone"
                    ref={field.ref}
                    countryLabel={t("fields.country")}
                    country={country}
                    onCountryChange={(c) => account.setValue("country", c)}
                    value={field.value}
                    onValueChange={field.onChange}
                    onBlur={field.onBlur}

                    aria-invalid={!!account.formState.errors.phone}
                  />
                )}
              />
            </FormField>

            <FormField
              id="password"
              label={t("fields.password")}
              error={v(account.formState.errors.password?.message)}
            >
              <Controller
                control={account.control}
                name="password"
                render={({ field }) => (
                  <PasswordInput
                    id="password"
                    autoComplete="new-password"
                    showStrength
                    aria-invalid={!!account.formState.errors.password}
                    {...field}
                  />
                )}
              />
            </FormField>

            <Controller
              control={account.control}
              name="acceptTerms"
              render={({ field }) => (
                <div className="space-y-1.5">
                  <div className="flex items-start gap-3">
                    <Checkbox
                      id="acceptTerms"
                      checked={field.value === true}
                      onCheckedChange={(checked) => field.onChange(checked === true)}
                      aria-invalid={!!account.formState.errors.acceptTerms}
                      className="mt-0.5"
                    />
                    <label
                      htmlFor="acceptTerms"
                      className="text-sm leading-relaxed text-muted-foreground"
                    >
                      {t.rich("fields.acceptTerms", {
                        terms: (chunks) => (
                          <Link
                            href="/cgu"
                            target="_blank"
                            className="text-foreground underline underline-offset-2"
                          >
                            {chunks}
                          </Link>
                        ),
                        privacy: (chunks) => (
                          <Link
                            href="/confidentialite"
                            target="_blank"
                            className="text-foreground underline underline-offset-2"
                          >
                            {chunks}
                          </Link>
                        ),
                      })}
                    </label>
                  </div>
                  {account.formState.errors.acceptTerms && (
                    <p role="alert" className="text-xs text-destructive">
                      {v("acceptTerms")}
                    </p>
                  )}
                </div>
              )}
            />

            <Button type="submit" size="lg" className="w-full">
              {t("signUp.continue")}
            </Button>
          </form>
          <p className="text-center text-sm text-muted-foreground">
            {t("signUp.haveAccount")}{" "}
            <Link href="/connexion" className="font-medium text-foreground hover:underline">
              {t("signIn.submit")}
            </Link>
          </p>
        </div>
      )}

      {step === 1 && (
        <form
          key="profile"
          noValidate
          onSubmit={profile.handleSubmit(submit)}
          className="animate-in space-y-5 duration-300 fade-in slide-in-from-right-4"
        >
          <fieldset className="space-y-2">
            <legend className="mb-2 text-sm font-medium">{t("fields.accountType")}</legend>
            <Controller
              control={profile.control}
              name="accountType"
              render={({ field }) => (
                <div
                  role="radiogroup"
                  aria-label={t("fields.accountType")}
                  className="grid grid-cols-2 gap-2 sm:grid-cols-3"
                >
                  {ACCOUNT_TYPES.map((type) => (
                    <button
                      key={type}
                      type="button"
                      role="radio"
                      aria-checked={field.value === type}
                      onClick={() => field.onChange(field.value === type ? undefined : type)}
                      className={cn(
                        "min-h-11 cursor-pointer rounded-xl border px-3 py-2 text-sm transition-all",
                        field.value === type
                          ? "border-transparent bg-brand-gradient text-white shadow-soft"
                          : "border-border bg-background-elevated/60 hover:border-ring/40",
                      )}
                    >
                      {t(`accountTypes.${type}`)}
                    </button>
                  ))}
                </div>
              )}
            />
          </fieldset>
          <FormField
            id="orgName"
            label={t("fields.orgName")}
            error={v(profile.formState.errors.orgName?.message)}
          >
            <Input
              id="orgName"
              autoComplete="organization"
              placeholder={t("fields.orgNamePlaceholder")}
              {...profile.register("orgName")}
            />
          </FormField>
          <div className="grid gap-5 sm:grid-cols-2">
            <FormField
              id="orgSector"
              label={t("fields.orgSector")}
              error={v(profile.formState.errors.orgSector?.message)}
            >
              <Input
                id="orgSector"
                placeholder={t("fields.orgSectorPlaceholder")}
                {...profile.register("orgSector")}
              />
            </FormField>
            <FormField
              id="city"
              label={t("fields.city")}
              error={v(profile.formState.errors.city?.message)}
            >
              <Input
                id="city"
                autoComplete="address-level2"
                placeholder={t("fields.cityPlaceholder")}
                {...profile.register("city")}
              />
            </FormField>
          </div>
          <div className="flex flex-col gap-3 pt-2">
            <Button type="submit" size="lg" loading={pending}>
              {t("signUp.submit")}
            </Button>
            <div className="flex items-center justify-between">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setStep(0)}
                disabled={pending}
              >
                <ArrowLeft /> {tCommon("back")}
              </Button>
              <Button
                type="button"
                variant="link"
                size="sm"
                onClick={() => submit({})}
                disabled={pending}
              >
                {t("signUp.skip")}
              </Button>
            </div>
          </div>
        </form>
      )}

      {step === 2 && <CheckEmail email={sentTo} onEdit={() => setStep(0)} />}
    </div>
  );
}

function CheckEmail({ email, onEdit }: { email: string; onEdit: () => void }) {
  const t = useTranslations("auth.signUp");
  const tAuth = useTranslations("auth");
  const [cooldown, setCooldown] = useState(30);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  return (
    <div className="animate-in space-y-6 text-center duration-300 fade-in zoom-in-[0.98]">
      <div className="relative mx-auto flex size-20 items-center justify-center">
        <div className="absolute -inset-6 bg-[radial-gradient(closest-side,rgb(129_140_248/0.35),transparent)]" />
        <div className="relative flex size-16 items-center justify-center rounded-2xl glass">
          <MailCheck className="size-7 text-accent-foreground" />
        </div>
      </div>
      <div className="space-y-3">
        <h1 className="font-display text-3xl font-semibold tracking-tight">
          {t("checkEmailTitle")}
        </h1>
        <p className="text-muted-foreground">
          {t.rich("checkEmailBody", {
            email: () => <strong className="text-foreground">{email}</strong>,
          })}
        </p>
        <p className="text-sm text-muted-foreground">{t("checkEmailTip")}</p>
      </div>
      {message && (
        <p role="status" className="text-sm text-success">
          {message}
        </p>
      )}
      <div className="flex flex-col gap-2">
        <Button
          variant="secondary"
          size="lg"
          disabled={cooldown > 0}
          loading={pending}
          onClick={() =>
            startTransition(async () => {
              const result = await resendConfirmation(email);
              setMessage(result.ok ? t("resent") : tAuth("rateLimited"));
              setCooldown(60);
            })
          }
        >
          {cooldown > 0 ? t("resendWait", { seconds: cooldown }) : t("resend")}
        </Button>
        <Button variant="ghost" size="sm" onClick={onEdit}>
          {t("wrongEmail")}
        </Button>
      </div>
    </div>
  );
}
