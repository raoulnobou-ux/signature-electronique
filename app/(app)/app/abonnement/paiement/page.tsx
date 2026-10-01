import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { PaddleCheckout } from "@/components/billing/paddle-checkout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { requireAccount } from "@/lib/auth/account";
import { getPaddle, paddleEnvironment } from "@/lib/billing";
import { serverEnv } from "@/lib/env.server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("app.billing.paddle");
  return { title: t("metaTitle"), robots: { index: false } };
}

/**
 * Page de paiement Paddle (lien de paiement par défaut du compte Paddle) : Paddle y ajoute
 * « _ptxn=txn_… » ; Paddle.js ouvre alors son formulaire sécurisé pour cette transaction.
 */
export default async function PaddleCheckoutPage({
  searchParams,
}: PageProps<"/app/abonnement/paiement">) {
  const [account, t, params, locale, nonce] = await Promise.all([
    requireAccount(),
    getTranslations("app.billing.paddle"),
    searchParams,
    getLocale(),
    headers().then((h) => h.get("x-nonce") ?? undefined),
  ]);
  const transactionId = typeof params._ptxn === "string" ? params._ptxn : "";
  const token = serverEnv.PADDLE_CLIENT_TOKEN;
  const { data: payment } =
    getPaddle() && /^txn_[a-z0-9]+$/i.test(transactionId)
      ? await createAdminClient()
          .from("payments")
          .select("provider_ref, status")
          .eq("provider", "paddle")
          .eq("provider_tx_id", transactionId)
          .eq("user_id", account.userId)
          .maybeSingle()
      : { data: null };

  return (
    <div className="mx-auto max-w-md space-y-6 py-6">
      <h1 className="font-display text-2xl font-semibold">{t("title")}</h1>
      {!payment || payment.status !== "pending" || !token ? (
        <Card>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {token ? t("notFound") : t("notConfigured")}
            </p>
            <Button asChild variant="secondary">
              <Link href="/app/abonnement">{t("back")}</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <PaddleCheckout
          token={token}
          sandbox={paddleEnvironment() === "sandbox"}
          transactionId={transactionId}
          reference={payment.provider_ref}
          email={account.email}
          locale={locale === "en" ? "en" : "fr"}
          nonce={nonce}
          labels={{ opening: t("opening"), retry: t("retry"), back: t("back") }}
        />
      )}
    </div>
  );
}
