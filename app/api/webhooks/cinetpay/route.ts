import { NextResponse } from "next/server";
import { getPaymentProvider } from "@/lib/billing";
import { settlePayment } from "@/lib/billing/service";
import type { Json } from "@/lib/supabase/database.types";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Notification CinetPay (notify_url, envoyée à chaque paiement) :
 * 1. authentification par le jeton HMAC `x-token` (clé secrète) ;
 * 2. journal brut + idempotence (une même notification n'est traitée qu'une fois) ;
 * 3. revérification de la transaction par l'API avant toute activation (settlePayment).
 * Une erreur renvoie 500 pour que CinetPay réessaie ; l'événement reste rejouable.
 */
export async function POST(request: Request) {
  const provider = getPaymentProvider();
  if (!provider || provider.name !== "cinetpay") {
    return NextResponse.json({ error: "not_configured" }, { status: 404 });
  }

  const rawBody = await request.text();
  if (rawBody.length > 100_000) return NextResponse.json({ error: "too_large" }, { status: 413 });
  const event = provider.parseWebhook(request.headers, rawBody);
  if (!event) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const { data: inserted, error: insertError } = await admin
    .from("payment_events")
    .insert({
      provider: provider.name,
      event_key: event.key,
      event_type: event.type,
      payload: (event.payload ?? {}) as NonNullable<Json>,
    })
    .select("id")
    .single();

  let eventId = inserted?.id;
  if (insertError) {
    if (insertError.code !== "23505") {
      console.error("[webhook] journal impossible", insertError);
      return NextResponse.json({ error: "storage" }, { status: 500 });
    }
    // Déjà reçu : on ne retraite que s'il avait échoué.
    const { data: existing } = await admin
      .from("payment_events")
      .select("id, processed_at")
      .eq("provider", provider.name)
      .eq("event_key", event.key)
      .single();
    if (existing?.processed_at) return NextResponse.json({ received: true, duplicate: true });
    eventId = existing?.id;
  }

  if (!event.reference) {
    await admin
      .from("payment_events")
      .update({ processed_at: new Date().toISOString() })
      .eq("id", eventId!);
    return NextResponse.json({ received: true, ignored: true });
  }

  try {
    const result = await settlePayment({
      reference: event.reference,
      transactionId: event.transactionId,
    });
    await admin
      .from("payment_events")
      .update({ processed_at: new Date().toISOString(), error: null })
      .eq("id", eventId!);
    return NextResponse.json({ received: true, outcome: result.outcome });
  } catch (error) {
    console.error("[webhook] traitement impossible", error);
    await admin
      .from("payment_events")
      .update({ error: error instanceof Error ? error.message.slice(0, 500) : "error" })
      .eq("id", eventId!);
    return NextResponse.json({ error: "processing" }, { status: 500 });
  }
}

/** CinetPay vérifie la disponibilité de l'URL de notification par une simple requête GET. */
export function GET() {
  return NextResponse.json({ ok: true });
}
