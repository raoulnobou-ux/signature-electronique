import "server-only";
import { serverEnv } from "@/lib/env.server";
import { CinetPayProvider } from "./cinetpay";
import type { PaymentProvider } from "./provider";
import { SandboxProvider } from "./sandbox";

let cached: PaymentProvider | null | undefined;

/**
 * Prestataire de paiement actif :
 * - CinetPay dès que CINETPAY_API_KEY et CINETPAY_SITE_ID sont définis ;
 * - sinon bac à sable local si PAYMENTS_SANDBOX=true, jamais en production Vercel ;
 * - sinon null : l'interface indique que le paiement n'est pas encore disponible.
 */
export function getPaymentProvider(): PaymentProvider | null {
  if (cached !== undefined) return cached;
  if (serverEnv.CINETPAY_API_KEY && serverEnv.CINETPAY_SITE_ID) {
    cached = new CinetPayProvider(
      serverEnv.CINETPAY_API_KEY,
      serverEnv.CINETPAY_SITE_ID,
      serverEnv.CINETPAY_SECRET_KEY,
    );
  } else if (serverEnv.PAYMENTS_SANDBOX === "true" && serverEnv.VERCEL_ENV !== "production") {
    cached = new SandboxProvider(serverEnv.SUPABASE_SERVICE_ROLE_KEY);
  } else {
    cached = null;
  }
  return cached;
}

export function getSandboxProvider(): SandboxProvider | null {
  const provider = getPaymentProvider();
  return provider instanceof SandboxProvider ? provider : null;
}
