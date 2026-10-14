import { NextResponse } from "next/server";
import { getChariow, getNotchPay, providerEnabled } from "@/lib/billing";
import { isAuthorizedCron } from "@/lib/cron/auth";
import { productionChecks, summarize } from "@/lib/deploy/readiness";
import { serverEnv } from "@/lib/env.server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * Santé du service (surveillance externe, test après déploiement). Public : un simple
 * statut. Avec « Authorization: Bearer <CRON_SECRET> » : le détail des vérifications
 * (jamais de valeur de variable, seulement présentes / absentes).
 */
export async function GET(request: Request) {
  const started = Date.now();
  const { error } = await createAdminClient()
    .from("plans_config")
    .select("plan", { head: true, count: "exact" });
  const database = !error;

  let conversion: boolean | null = null;
  if (serverEnv.GOTENBERG_URL) {
    try {
      const res = await fetch(`${serverEnv.GOTENBERG_URL}/health`, {
        signal: AbortSignal.timeout(5000),
      });
      conversion = res.ok;
    } catch {
      conversion = false;
    }
  }

  const status = database ? "ok" : "down";
  const body: Record<string, unknown> = {
    status,
    database,
    conversion,
    latencyMs: Date.now() - started,
  };
  if (isAuthorizedCron(request)) {
    const report = summarize(productionChecks(process.env));
    body.production = {
      ready: report.ready,
      blocking: report.blocking.map((c) => c.message),
      warnings: report.warnings.map((c) => c.message),
    };
    body.payments = paymentsDiagnostic();
  }
  return NextResponse.json(body, {
    status: database ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  });
}

/**
 * Pourquoi un prestataire est actif ou non : variables présentes ou absentes (jamais leur
 * valeur), liste PAYMENT_PROVIDERS (des noms, rien de secret) et état réel du registre.
 */
function paymentsDiagnostic() {
  const has = (name: keyof typeof serverEnv) => Boolean(serverEnv[name]);
  return {
    PAYMENT_PROVIDERS: serverEnv.PAYMENT_PROVIDERS?.trim() || null,
    notchpay: {
      active: getNotchPay() !== null,
      enabled: providerEnabled("notchpay"),
      NOTCHPAY_PUBLIC_KEY: has("NOTCHPAY_PUBLIC_KEY"),
      NOTCHPAY_WEBHOOK_SECRET: has("NOTCHPAY_WEBHOOK_SECRET"),
    },
    chariow: {
      active: getChariow() !== null,
      enabled: providerEnabled("chariow"),
      CHARIOW_API_KEY: has("CHARIOW_API_KEY"),
      CHARIOW_PULSE_SECRET: has("CHARIOW_PULSE_SECRET"),
      CHARIOW_PRODUCT_ESSENTIAL_MONTHLY: has("CHARIOW_PRODUCT_ESSENTIAL_MONTHLY"),
      CHARIOW_PRODUCT_ESSENTIAL_YEARLY: has("CHARIOW_PRODUCT_ESSENTIAL_YEARLY"),
      CHARIOW_PRODUCT_PRO_MONTHLY: has("CHARIOW_PRODUCT_PRO_MONTHLY"),
      CHARIOW_PRODUCT_PRO_YEARLY: has("CHARIOW_PRODUCT_PRO_YEARLY"),
    },
  };
}
