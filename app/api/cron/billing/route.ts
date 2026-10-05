import { NextResponse } from "next/server";
import { runBillingCron } from "@/lib/billing/service";
import { isAuthorizedCron } from "@/lib/cron/auth";

/** Tâche quotidienne de facturation (rappels, grâce, retour à l'accès gratuit) — voir runBillingCron. */
export async function GET(request: Request) {
  if (!isAuthorizedCron(request))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    return NextResponse.json(await runBillingCron());
  } catch (error) {
    console.error("[cron] facturation", error);
    return NextResponse.json({ error: "billing_failed" }, { status: 500 });
  }
}
