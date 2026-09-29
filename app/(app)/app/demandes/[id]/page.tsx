import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { RequestTracking } from "@/components/requests/request-tracking";
import { requireAccount } from "@/lib/auth/account";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("requests.detail");
  return { title: t("metaTitle") };
}

export default async function RequestPage(props: PageProps<"/app/demandes/[id]">) {
  const [{ id }, searchParams] = await Promise.all([
    props.params,
    props.searchParams,
    requireAccount(),
  ]);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();
  const { data: request } = await supabase
    .from("signature_requests")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!request) notFound();
  const [{ data: signers }, { data: events }] = await Promise.all([
    supabase.from("request_signers").select("*").eq("request_id", id).order("order_index"),
    supabase
      .from("audit_events")
      .select("id, created_at, event_type, actor_label, metadata")
      .eq("request_id", id)
      .order("created_at", { ascending: false })
      .limit(200),
  ]);

  return (
    <RequestTracking
      justSent={searchParams.envoyee === "1"}
      request={{
        id: request.id,
        title: request.title ?? "Document",
        status: request.status,
        mode: request.mode as "sequential" | "parallel",
        documentId: request.document_id,
        expiresAt: request.expires_at,
        completedAt: request.completed_at,
        hasCertificate: Boolean(request.certificate_path),
        finalSha256: request.final_sha256,
      }}
      signers={(signers ?? []).map((s) => ({
        id: s.id,
        name: s.name,
        email: s.email,
        phone: s.phone,
        status: s.status,
        order: s.order_index,
        signedAt: s.signed_at,
        openedAt: s.opened_at,
        declinedReason: s.declined_reason,
      }))}
      events={(events ?? []).map((e) => ({
        id: e.id,
        at: e.created_at,
        type: e.event_type,
        actor:
          e.actor_label ?? (e.metadata as { signer_name?: string } | null)?.signer_name ?? null,
      }))}
    />
  );
}
