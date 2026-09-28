"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Controller, useForm } from "react-hook-form";
import { FormField } from "@/components/auth/form-field";
import { GoogleButton } from "@/components/auth/google-button";
import { PasswordInput } from "@/components/auth/password-input";
import { useValidationMessage } from "@/components/auth/use-validation-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { signInSchema, type SignInInput } from "@/lib/validation/auth";
import { resendConfirmation, signIn } from "../actions";

type Notice = { tone: "error" | "success"; text: string; resend?: boolean } | null;

export function SignInForm({ next, initialNotice }: { next?: string; initialNotice?: Notice }) {
  const t = useTranslations("auth");
  const v = useValidationMessage();
  const [notice, setNotice] = useState<Notice>(initialNotice ?? null);
  const [pending, startTransition] = useTransition();
  const form = useForm<SignInInput>({
    resolver: zodResolver(signInSchema),
    mode: "onTouched",
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = form.handleSubmit((values) => {
    setNotice(null);
    startTransition(async () => {
      const result = await signIn(values, next);
      // En cas de succès, le serveur redirige : on n'arrive ici qu'en cas d'erreur.
      if (!result || result.ok) return;
      if (result.error === "unconfirmed")
        setNotice({ tone: "error", text: t("signIn.unconfirmed"), resend: true });
      else if (result.error === "invalid_credentials")
        setNotice({ tone: "error", text: t("signIn.invalid") });
      else if (result.error === "rate_limited")
        setNotice({ tone: "error", text: t("rateLimited") });
      else if (result.error !== "invalid") setNotice({ tone: "error", text: t("genericError") });
    });
  });

  return (
    <div className="space-y-8">
      <div className="space-y-1.5">
        <h1 className="font-display text-3xl font-semibold tracking-tight">{t("signIn.title")}</h1>
        <p className="text-muted-foreground">{t("signIn.subtitle")}</p>
      </div>

      {notice && (
        <div
          role={notice.tone === "error" ? "alert" : "status"}
          className={
            notice.tone === "error"
              ? "space-y-2 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
              : "rounded-xl border border-success/30 bg-success/10 px-4 py-3 text-sm text-success"
          }
        >
          <p>{notice.text}</p>
          {notice.resend && (
            <button
              type="button"
              className="cursor-pointer font-medium underline underline-offset-2"
              onClick={() =>
                startTransition(async () => {
                  const result = await resendConfirmation(form.getValues("email"));
                  setNotice(
                    result.ok
                      ? { tone: "success", text: t("signUp.resent") }
                      : { tone: "error", text: t("rateLimited") },
                  );
                })
              }
            >
              {t("signIn.resendConfirmation")}
            </button>
          )}
        </div>
      )}

      <GoogleButton next={next} onError={(text) => setNotice({ tone: "error", text })} />

      <form noValidate onSubmit={onSubmit} className="space-y-5">
        <FormField
          id="email"
          label={t("fields.email")}
          error={v(form.formState.errors.email?.message)}
        >
          <Input
            id="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder={t("fields.emailPlaceholder")}
            aria-invalid={!!form.formState.errors.email}
            {...form.register("email")}
          />
        </FormField>
        <FormField
          id="password"
          label={t("fields.password")}
          error={v(form.formState.errors.password?.message)}
          labelAction={
            <Link
              href="/mot-de-passe-oublie"
              className="text-xs font-medium text-accent-foreground hover:underline"
            >
              {t("signIn.forgot")}
            </Link>
          }
        >
          <Controller
            control={form.control}
            name="password"
            render={({ field }) => (
              <PasswordInput
                id="password"
                autoComplete="current-password"
                aria-invalid={!!form.formState.errors.password}
                {...field}
              />
            )}
          />
        </FormField>
        <Button type="submit" size="lg" className="w-full" loading={pending}>
          {t("signIn.submit")}
        </Button>
      </form>

      <p className="text-center text-sm text-muted-foreground">
        {t("signIn.noAccount")}{" "}
        <Link href="/inscription" className="font-medium text-foreground hover:underline">
          {t("signUp.title")}
        </Link>
      </p>
    </div>
  );
}
