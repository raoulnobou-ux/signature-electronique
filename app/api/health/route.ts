import { NextResponse } from "next/server";
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
  }
  return NextResponse.json(body, {
    status: database ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  });
}
