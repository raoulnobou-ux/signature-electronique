import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { RequestBuilder } from "@/components/requests/request-builder";
import { requireAccount } from "@/lib/auth/account";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("requests.builder");
  return { title: t("metaTitle") };
}

/** Préparation d'une demande de signature (Pro) : signataires, zones, envoi. */
export default async function NewRequestPage(props: PageProps<"/app/documents/[id]/demande">) {
  const [{ id }, account] = await Promise.all([props.params, requireAccount()]);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  if (account.entitlements.readOnly) redirect(`/app/documents/${id}`);
  if (!account.entitlements.features.multi_signers) redirect("/app/demandes");

  const supabase = await createClient();
  const { data: doc } = await supabase
    .from("documents")
    .select("id, title, pdf_path, owner_id, status, trashed_at")
    .eq("id", id)
    .maybeSingle();
  if (!doc || !doc.pdf_path || doc.trashed_at || doc.owner_id !== account.userId) notFound();
  if (doc.status === "pending") {
    const { data: pending } = await supabase
      .from("signature_requests")
      .select("id")
      .eq("document_id", id)
      .eq("status", "pending")
      .maybeSingle();
    redirect(pending ? `/app/demandes/${pending.id}` : `/app/documents/${id}`);
  }
  const { data: signed } = await createAdminClient().storage.from("documents").createSignedUrl(doc.pdf_path, 3600);
  if (!signed) notFound();

  return (
    <RequestBuilder document={{ id: doc.id, title: doc.title }} pdfUrl={signed.signedUrl} />
  );
}
