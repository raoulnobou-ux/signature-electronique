"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { CheckCircle2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { contactSchema, type ContactInput } from "@/lib/validation/contact";
import { sendContactMessage } from "./actions";

export function ContactForm() {
  const t = useTranslations("contact.form");
  const tv = useTranslations("validation");
  const [status, setStatus] = useState<"idle" | "sent" | "error" | "rate_limited">("idle");
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ContactInput>({ resolver: zodResolver(contactSchema), mode: "onTouched" });

  const onSubmit = handleSubmit(async (values) => {
    const result = await sendContactMessage(values);
    if (result.ok) {
      setStatus("sent");
      reset();
    } else {
      setStatus(result.error === "rate_limited" ? "rate_limited" : "error");
    }
  });

  const fieldError = (name: keyof ContactInput) => {
    const key = errors[name]?.message;
    return key ? tv(key as "required" | "email" | "tooShort" | "tooLong") : undefined;
  };

  if (status === "sent") {
    return (
      <div role="status" className="flex flex-col items-center gap-4 py-12 text-center">
        <div className="flex size-14 items-center justify-center rounded-2xl bg-success/15 text-success">
          <CheckCircle2 className="size-7" />
        </div>
        <p className="max-w-xs font-medium">{t("success")}</p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      <div className="grid gap-5 sm:grid-cols-2">
        <Field id="name" label={t("name")} error={fieldError("name")}>
          <Input id="name" autoComplete="name" aria-invalid={!!errors.name} {...register("name")} />
        </Field>
        <Field id="email" label={t("email")} error={fieldError("email")}>
          <Input
            id="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            aria-invalid={!!errors.email}
            {...register("email")}
          />
        </Field>
      </div>
      <Field id="organization" label={t("organization")} error={fieldError("organization")}>
        <Input id="organization" autoComplete="organization" {...register("organization")} />
      </Field>
      <Field id="message" label={t("message")} error={fieldError("message")}>
        <Textarea
          id="message"
          rows={6}
          placeholder={t("messagePlaceholder")}
          aria-invalid={!!errors.message}
          {...register("message")}
        />
      </Field>
      {/* Champ piège pour les robots, invisible pour les humains et les lecteurs d'écran */}
      <input
        type="text"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden
        className="hidden"
        {...register("website")}
      />
      {(status === "error" || status === "rate_limited") && (
        <p role="alert" className="text-sm text-destructive">
          {t(status === "rate_limited" ? "rateLimited" : "error")}
        </p>
      )}
      <Button type="submit" size="lg" loading={isSubmitting} className="w-full sm:w-auto">
        {t("submit")}
      </Button>
    </form>
  );
}

function Field({
  id,
  label,
  error,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error && (
        <p id={`${id}-error`} className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
