"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Controller, useForm } from "react-hook-form";
import { FormField } from "@/components/auth/form-field";
import { PasswordInput } from "@/components/auth/password-input";
import { useValidationMessage } from "@/components/auth/use-validation-message";
import { Button } from "@/components/ui/button";
import { resetPasswordSchema, type ResetPasswordInput } from "@/lib/validation/auth";
import { updatePassword } from "../actions";

export function ResetPasswordForm() {
  const t = useTranslations("auth");
  const v = useValidationMessage();
  const [error, setError] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);
  const [pending, startTransition] = useTransition();
  const form = useForm<ResetPasswordInput>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: "", confirm: "" },
  });

  return (
    <div className="space-y-8">
      <div className="space-y-1.5">
        <h1 className="font-display text-3xl font-semibold tracking-tight">{t("reset.title")}</h1>
        <p className="text-muted-foreground">{t("reset.subtitle")}</p>
      </div>
      {error && (
        <div
          role="alert"
          className="space-y-2 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          <p>{error}</p>
          {expired && (
            <Link href="/mot-de-passe-oublie" className="font-medium underline underline-offset-2">
              {t("forgot.submit")}
            </Link>
          )}
        </div>
      )}
      <form
        noValidate
        className="space-y-5"
        onSubmit={form.handleSubmit((values) =>
          startTransition(async () => {
            setError(null);
            const result = await updatePassword(values);
            if (!result || result.ok) return;
            if (result.error === "expired") {
              setExpired(true);
              setError(t("reset.expired"));
            } else if (result.fieldErrors?.password) {
              form.setError("password", { message: result.fieldErrors.password });
            } else setError(t("genericError"));
          }),
        )}
      >
        <FormField
          id="password"
          label={t("fields.newPassword")}
          error={v(form.formState.errors.password?.message)}
        >
          <Controller
            control={form.control}
            name="password"
            render={({ field }) => (
              <PasswordInput id="password" autoComplete="new-password" showStrength {...field} />
            )}
          />
        </FormField>
        <FormField
          id="confirm"
          label={t("fields.confirmPassword")}
          error={v(form.formState.errors.confirm?.message)}
        >
          <Controller
            control={form.control}
            name="confirm"
            render={({ field }) => (
              <PasswordInput id="confirm" autoComplete="new-password" {...field} />
            )}
          />
        </FormField>
        <Button type="submit" size="lg" className="w-full" loading={pending}>
          {t("reset.submit")}
        </Button>
      </form>
    </div>
  );
}
