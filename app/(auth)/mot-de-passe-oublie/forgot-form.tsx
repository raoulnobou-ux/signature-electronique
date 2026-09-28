"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, MailCheck } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { FormField } from "@/components/auth/form-field";
import { useValidationMessage } from "@/components/auth/use-validation-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { forgotPasswordSchema, type ForgotPasswordInput } from "@/lib/validation/auth";
import { requestPasswordReset } from "../actions";

export function ForgotPasswordForm() {
  const t = useTranslations("auth");
  const v = useValidationMessage();
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const form = useForm<ForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: "" },
  });

  if (sent) {
    return (
      <div className="animate-in space-y-6 text-center duration-300 fade-in">
        <div className="mx-auto flex size-16 items-center justify-center rounded-2xl glass">
          <MailCheck className="size-7 text-accent-foreground" />
        </div>
        <div className="space-y-2">
          <h1 className="font-display text-3xl font-semibold tracking-tight">
            {t("forgot.sentTitle")}
          </h1>
          <p className="text-muted-foreground">{t("forgot.sentBody")}</p>
        </div>
        <Button asChild variant="secondary" size="lg" className="w-full">
          <Link href="/connexion">{t("forgot.back")}</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <Link
        href="/connexion"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> {t("forgot.back")}
      </Link>
      <div className="space-y-1.5">
        <h1 className="font-display text-3xl font-semibold tracking-tight">{t("forgot.title")}</h1>
        <p className="text-muted-foreground">{t("forgot.subtitle")}</p>
      </div>
      {error && (
        <p
          role="alert"
          className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          {error}
        </p>
      )}
      <form
        noValidate
        className="space-y-5"
        onSubmit={form.handleSubmit((values) =>
          startTransition(async () => {
            setError(null);
            const result = await requestPasswordReset(values);
            if (result.ok) setSent(true);
            else setError(result.error === "rate_limited" ? t("rateLimited") : t("genericError"));
          }),
        )}
      >
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
            {...form.register("email")}
          />
        </FormField>
        <Button type="submit" size="lg" className="w-full" loading={pending}>
          {t("forgot.submit")}
        </Button>
      </form>
    </div>
  );
}
