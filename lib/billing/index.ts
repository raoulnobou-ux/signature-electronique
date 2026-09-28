import "server-only";
import { serverEnv } from "@/lib/env.server";
import { FlutterwaveProvider } from "./flutterwave";
import type { PaymentProvider } from "./provider";
import { SandboxProvider } from "./sandbox";

let cached: PaymentProvider | null | undefined;

/**
 * Prestataire de paiement actif :
 * - Flutterwave dès que FLUTTERWAVE_SECRET_KEY est définie (clés de test ou de production) ;
 * - sinon bac à sable local si PAYMENTS_SANDBOX=true, jamais en production Vercel ;
 * - sinon null : l'interface indique que le paiement n'est pas encore disponible.
 */
export function getPaymentProvider(): PaymentProvider | null {
  if (cached !== undefined) return cached;
  if (serverEnv.FLUTTERWAVE_SECRET_KEY) {
    cached = new FlutterwaveProvider(serverEnv.FLUTTERWAVE_SECRET_KEY, serverEnv.FLUTTERWAVE_WEBHOOK_HASH);
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
