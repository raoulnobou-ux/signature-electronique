"use client";

import { ShieldCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { signOut } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { verifyLoginCode } from "./actions";

export function MfaForm({ next }: { next?: string }) {
  const t = useTranslations("auth.mfa");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <span className="flex size-12 items-center justify-center rounded-2xl bg-brand-gradient text-white">
          <ShieldCheck className="size-6" aria-hidden />
        </span>
        <h1 className="font-display text-3xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground">{t("subtitle")}</p>
      </div>
      <form
        noValidate
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          start(async () => {
            const result = await verifyLoginCode(code, next);
            // En cas de succès, le serveur redirige.
            if (!result || result.ok) return;
            setError(result.error === "rate_limited" ? t("rateLimited") : result.error === "expired" ? t("expired") : t("invalid"));
            setCode("");
          });
        }}
      >
        <div className="space-y-2">
          <Label htmlFor="mfa-code">{t("code")}</Label>
          <Input
            id="mfa-code"
            autoFocus
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            aria-invalid={Boolean(error)}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            className="h-14 text-center font-mono text-2xl tracking-[0.5em]"
          />
        </div>
        {error && (
          <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </p>
        )}
        <Button type="submit" size="lg" className="w-full" loading={pending} disabled={code.length !== 6}>
          {t("submit")}
        </Button>
      </form>
      <div className="space-y-3 text-center text-sm text-muted-foreground">
        <p>{t("help")}</p>
        <button type="button" className="cursor-pointer font-medium text-accent-foreground hover:underline" onClick={() => signOut()}>
          {t("signOut")}
        </button>
      </div>
    </div>
  );
}
