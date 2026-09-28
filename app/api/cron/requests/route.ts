import { NextResponse } from "next/server";
import { isAuthorizedCron } from "@/lib/cron/auth";
import { runRequestsCron } from "@/lib/requests/service";

/** Tâche quotidienne des demandes de signature : expiration et relances automatiques. */
export async function GET(request: Request) {
  if (!isAuthorizedCron(request))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    return NextResponse.json(await runRequestsCron());
  } catch (error) {
    console.error("[cron] demandes", error);
    return NextResponse.json({ error: "requests_failed" }, { status: 500 });
  }
}
