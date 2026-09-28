import { FlaskConical } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { SandboxCheckout } from "@/components/billing/sandbox-checkout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { requireAccount } from "@/lib/auth/account";
import { getSandboxProvider } from "@/lib/billing";
import { paymentDescription } from "@/lib/billing/service";
import { isPaidPlan, type BillingCycle, type Currency } from "@/lib/entitlements/plans";
import { formatMoney } from "@/lib/format";
import { createAdminClient } from "@/lib/supabase/admin";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("app.billing.sandbox");
  return { title: t("metaTitle"), robots: { index: false } };
}

/** Checkout simulé (développement et tests) — n'existe pas quand CinetPay est configuré. */
export default async function SandboxCheckoutPage({ searchParams }: PageProps<"/app/abonnement/paiement-test">) {
  if (!getSandboxProvider()) notFound();
  const [account, t, params] = await Promise.all([
    requireAccount(),
    getTranslations("app.billing.sandbox"),
    searchParams,
  ]);
  const reference = typeof params.ref === "string" ? params.ref : "";
  const { data: payment } = await createAdminClient()
    .from("payments")
    .select("amount, currency, plan, billing_cycle, kind, status")
    .eq("provider_ref", reference)
    .eq("user_id", account.userId)
    .maybeSingle();

  return (
    <div className="mx-auto max-w-md space-y-6 py-6">
      <div className="flex items-center gap-3">
        <span className="flex size-10 items-center justify-center rounded-xl bg-warning/15 text-warning">
          <FlaskConical className="size-5" aria-hidden />
        </span>
        <h1 className="font-display text-2xl font-semibold">{t("title")}</h1>
      </div>
      <p className="rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm">{t("notice")}</p>
      {!payment || payment.status === "successful" || !isPaidPlan(payment.plan) ? (
        <Card>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">{t("notFound")}</p>
            <Button asChild variant="secondary">
              <Link href="/app/abonnement">{t("back")}</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="space-y-6">
            <div>
              <p className="text-sm text-muted-foreground">
                {paymentDescription(payment.plan, payment.billing_cycle as BillingCycle, payment.kind)}
              </p>
              <p className="font-display text-4xl font-semibold tabular-nums">
                {formatMoney(Number(payment.amount), payment.currency as Currency)}
              </p>
            </div>
            <SandboxCheckout
              reference={reference}
              amountLabel={formatMoney(Number(payment.amount), payment.currency as Currency)}
              cardOnly={payment.currency === "USD"}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
