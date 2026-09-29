"use client";

import { ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  confirmTotpEnrollment,
  disableTotp,
  startTotpEnrollment,
  type MfaError,
} from "@/app/(app)/app/parametres/mfa-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Enrollment = { factorId: string; qrCode: string; secret: string };

function CodeInput({ id, value, onChange, label }: { id: string; value: string; onChange: (v: string) => void; label: string }) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="\d{6}"
        maxLength={6}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 6))}
        className="text-center font-mono text-xl tracking-[0.4em]"
      />
    </div>
  );
}

/** Double authentification par application (TOTP) : activation par QR code, désactivation par code. */
export function TwoFactorCard({ enabled }: { enabled: boolean }) {
  const t = useTranslations("app.settings.security");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [disabling, setDisabling] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  const message = (e: MfaError) =>
    e === "invalid_code" ? t("twoFactorInvalid") : e === "rate_limited" ? t("twoFactorRateLimited") : t("twoFactorError");

  const close = () => {
    setEnrollment(null);
    setDisabling(false);
    setCode("");
    setError(null);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="size-5 text-accent-foreground" aria-hidden /> {t("twoFactorTitle")}
          </CardTitle>
          <Badge variant={enabled ? "success" : "outline"} data-testid="mfa-status">
            {enabled ? t("twoFactorOn") : t("twoFactorOff")}
          </Badge>
        </div>
        <CardDescription>{t("twoFactorBody")}</CardDescription>
      </CardHeader>
      <CardContent>
        {enabled ? (
          <Button variant="secondary" onClick={() => setDisabling(true)}>
            {t("twoFactorDisable")}
          </Button>
        ) : (
          <Button
            loading={pending && !enrollment}
            onClick={() =>
              start(async () => {
                const result = await startTotpEnrollment();
                if (result.ok) setEnrollment(result);
                else toast.error(message(result.error));
              })
            }
          >
            {t("twoFactorEnable")}
          </Button>
        )}
      </CardContent>

      <Dialog open={Boolean(enrollment)} onOpenChange={(open) => !open && close()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("twoFactorSetupTitle")}</DialogTitle>
            <DialogDescription>{t("twoFactorScan")}</DialogDescription>
          </DialogHeader>
          {enrollment && (
            <form
              className="space-y-5"
              onSubmit={(e) => {
                e.preventDefault();
                setError(null);
                start(async () => {
                  const result = await confirmTotpEnrollment(enrollment.factorId, code);
                  if (!result.ok) return setError(message(result.error));
                  toast.success(t("twoFactorEnabled"));
                  close();
                  router.refresh();
                });
              }}
            >
              {/* QR code fourni par Supabase (image SVG en data URL). */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={enrollment.qrCode} alt="" className="mx-auto size-44 rounded-xl bg-white p-2" data-testid="mfa-qr" />
              <div className="space-y-1 text-center">
                <p className="text-xs text-muted-foreground">{t("twoFactorSecret")}</p>
                <code className="block rounded-lg bg-secondary px-3 py-2 font-mono text-sm break-all select-all" data-testid="mfa-secret">
                  {enrollment.secret}
                </code>
              </div>
              <p className="text-sm">{t("twoFactorEnterCode")}</p>
              <CodeInput id="mfa-enroll-code" value={code} onChange={setCode} label={t("twoFactorCode")} />
              {error && (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              )}
              <Button type="submit" className="w-full" loading={pending} disabled={code.length !== 6}>
                {t("twoFactorConfirm")}
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={disabling} onOpenChange={(open) => !open && close()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("twoFactorDisableTitle")}</DialogTitle>
            <DialogDescription>{t("twoFactorDisableBody")}</DialogDescription>
          </DialogHeader>
          <form
            className="space-y-5"
            onSubmit={(e) => {
              e.preventDefault();
              setError(null);
              start(async () => {
                const result = await disableTotp(code);
                if (!result.ok) return setError(message(result.error));
                toast.success(t("twoFactorDisabled"));
                close();
                router.refresh();
              });
            }}
          >
            <CodeInput id="mfa-disable-code" value={code} onChange={setCode} label={t("twoFactorCode")} />
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <Button type="submit" variant="destructive" className="w-full" loading={pending} disabled={code.length !== 6}>
              {t("twoFactorDisable")}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
