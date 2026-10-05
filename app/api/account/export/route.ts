import { NextResponse } from "next/server";
import { recordAudit } from "@/lib/audit";
import { rateLimit } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";

/** Export des données personnelles (droit d'accès et de portabilité), au format JSON. */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  // Export complet (lourd) : quelques fois par heure suffisent.
  if (!(await rateLimit("account-export", user.id, 10, 3600)))
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  await recordAudit({ actorType: "user", actorId: user.id, eventType: "account.exported" });

  const [profile, subscription, payments, documents, versions, assets, requests, audit, templates] =
    await Promise.all([
      supabase.from("profiles").select("*").eq("id", user.id).single(),
      supabase.from("subscriptions").select("*").eq("user_id", user.id).maybeSingle(),
      supabase.from("payments").select("*").order("created_at"),
      supabase.from("documents").select("*").eq("owner_id", user.id).order("created_at"),
      supabase.from("document_versions").select("*").order("created_at"),
      supabase
        .from("signature_assets")
        .select("id, type, name, method, created_at")
        .eq("owner_id", user.id),
      supabase.from("signature_requests").select("*, request_signers(*)").eq("owner_id", user.id),
      supabase.from("audit_events").select("*").order("created_at"),
      supabase.from("templates").select("*").eq("owner_id", user.id),
    ]);

  const body = {
    exportedAt: new Date().toISOString(),
    account: { id: user.id, email: user.email, createdAt: user.created_at },
    profile: profile.data,
    subscription: subscription.data,
    payments: payments.data ?? [],
    documents: documents.data ?? [],
    documentVersions: versions.data ?? [],
    signatureAssets: assets.data ?? [],
    signatureRequests: requests.data ?? [],
    auditEvents: audit.data ?? [],
    templates: templates.data ?? [],
    note: "Les fichiers (PDF, images) se téléchargent depuis l'application. Ce fichier contient toutes les données associées.",
  };

  return new NextResponse(JSON.stringify(body, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="quicksign-export-${new Date().toISOString().slice(0, 10)}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
