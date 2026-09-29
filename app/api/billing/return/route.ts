import { NextResponse, type NextRequest } from "next/server";
import { settlePayment } from "@/lib/billing/service";
import { publicEnv } from "@/lib/env";
import { rateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/request";

const RESULT = {
  successful: "succes",
  failed: "echec",
  pending: "attente",
  unknown: "attente",
} as const;

/**
 * Retour du navigateur après le checkout (GET, ou POST de formulaire selon le prestataire).
 * Les paramètres reçus (dont « status ») ne sont jamais crus : la transaction est revérifiée
 * auprès du prestataire. Le webhook fait de même ; le premier arrivé active l'abonnement,
 * l'autre ne fait rien.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  return settleAndRedirect(params.get("ref") ?? params.get("tx_ref"), params.get("transaction_id"));
}

export async function POST(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const form = await request.formData().catch(() => null);
  const posted = (name: string) => {
    const value = form?.get(name);
    return typeof value === "string" ? value : null;
  };
  return settleAndRedirect(params.get("ref") ?? posted("transaction_id"), posted("transaction_id"));
}

async function settleAndRedirect(reference: string | null, transactionId: string | null) {
  const target = new URL("/app/abonnement", publicEnv.NEXT_PUBLIC_APP_URL);

  const ip = (await getClientIp()) ?? "unknown";
  if (!reference || reference.length > 80 || !(await rateLimit("billing-return", ip, 60, 600))) {
    target.searchParams.set("paiement", "attente");
    return NextResponse.redirect(target, 303);
  }

  let outcome: keyof typeof RESULT = "pending";
  try {
    outcome = (
      await settlePayment({ reference, transactionId: transactionId?.slice(0, 120) ?? null })
    ).outcome;
  } catch (error) {
    console.error("[billing] retour de paiement", error);
  }
  target.searchParams.set("paiement", RESULT[outcome]);
  return NextResponse.redirect(target, 303);
}
