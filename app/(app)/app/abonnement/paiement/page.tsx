import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getLocale as getRequestLocale, getTranslations } from "next-intl/server";
import { PaymentStatus } from "@/components/billing/payment-status";
import { ClientMessages } from "@/components/providers/client-messages";
import { requireAccount } from "@/lib/auth/account";
import { failureKind } from "@/lib/billing/failure";
import { paymentDescription } from "@/lib/billing/service";
import { toLocale } from "@/i18n/config";
import { isPaidPlan, type BillingCycle, type Currency } from "@/lib/entitlements/plans";
import { formatMoney } from "@/lib/format";
import { createAdminClient } from "@/lib/supabase/admin";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("app.billing.paymentPage");
  return { title: t("metaTitle"), robots: { index: false } };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Retour après la page de paiement Notch Pay (callback). Les paramètres ajoutés par Notch
 * Pay (status, reference, trxref) ne sont jamais crus : l'état vient de notre base, mise à
 * jour par le webhook ou par une revérification serveur auprès de Notch Pay.
 */
export default async function PaymentReturnPage({
  searchParams,
}: PageProps<"/app/abonnement/paiement">) {
  const [account, params, locale] = await Promise.all([
    requireAccount(),
    searchParams,
    getRequestLocale(),
  ]);
  const reference = typeof params.ref === "string" ? params.ref : "";
  if (!UUID.test(reference)) redirect("/app/abonnement");

  const { data: payment } = await createAdminClient()
    .from("payments")
    .select("amount, currency, plan, billing_cycle, kind, status, failure_reason")
    .eq("provider_ref", reference)
    .eq("user_id", account.userId)
    .maybeSingle();
  // Paiement inconnu ou d'un autre compte : même réponse, sans rien révéler.
  if (!payment || !isPaidPlan(payment.plan)) redirect("/app/abonnement");

  const hint = typeof params.reference === "string" ? params.reference.slice(0, 120) : null;
  const status =
    payment.status === "successful"
      ? "successful"
      : payment.status === "pending"
        ? "pending"
        : "failed";

  return (
    <div className="mx-auto max-w-xl py-6">
      <ClientMessages namespaces={["app.billing.paymentPage"]}>
        <PaymentStatus
          reference={reference}
          hint={hint}
          initial={{
            status,
            failure:
              status === "failed"
                ? failureKind(payment.status === "cancelled" ? "abandoned" : payment.failure_reason)
                : null,
          }}
          summary={{
            description: paymentDescription(
              payment.plan,
              payment.billing_cycle as BillingCycle,
              payment.kind,
              toLocale(locale),
            ),
            amount: formatMoney(Number(payment.amount), payment.currency as Currency, locale),
          }}
        />
      </ClientMessages>
    </div>
  );
}
