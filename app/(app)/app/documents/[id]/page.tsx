import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DocumentAssistant } from "@/components/assistant/document-assistant";
import { SaveAsTemplateButton } from "@/components/templates/save-as-template";
import { requireAccount } from "@/lib/auth/account";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { DocumentDetail } from "./document-detail";

export async function generateMetadata(props: PageProps<"/app/documents/[id]">): Promise<Metadata> {
  const { id } = await props.params;
  const supabase = await createClient();
  const { data } = await supabase.from("documents").select("title").eq("id", id).maybeSingle();
  return { title: data?.title ?? "Document" };
}

export default async function DocumentPage(props: PageProps<"/app/documents/[id]">) {
  const [{ id }, account] = await Promise.all([props.params, requireAccount()]);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const supabase = await createClient();
  const { data: doc } = await supabase
    .from("documents")
    .select("*, folders(name), document_versions(version, sha256, created_at, note)")
    .eq("id", id)
    .maybeSingle();
  if (!doc || !doc.pdf_path) notFound();

  const { data: pendingRequest } = await supabase
    .from("signature_requests")
    .select("id")
    .eq("document_id", id)
    .eq("status", "pending")
    .maybeSingle();

  // URL signée valable 30 min : le temps de lire le document tranquillement.
  const { data: signed } = await createAdminClient()
    .storage.from("documents")
    .createSignedUrl(doc.pdf_path, 1800);
  if (!signed) notFound();

  return (
    <DocumentDetail
      readOnly={account.entitlements.readOnly}
      pendingRequestId={pendingRequest?.id ?? null}
      canRequest={account.entitlements.features.multi_signers && doc.owner_id === account.userId}
      pdfUrl={signed.signedUrl}
      extraActions={
        <>
          {!doc.trashed_at && <DocumentAssistant id={doc.id} title={doc.title} />}
          {account.entitlements.features.templates &&
            doc.owner_id === account.userId &&
            !doc.trashed_at && <SaveAsTemplateButton documentId={doc.id} defaultName={doc.title} />}
        </>
      }
      doc={{
        id: doc.id,
        title: doc.title,
        status: doc.status as "draft" | "pending" | "signed" | "declined" | "expired",
        pageCount: doc.page_count ?? 0,
        sizeBytes: doc.size_bytes,
        createdAt: doc.created_at,
        originalName: doc.original_name,
        originalType: doc.original_type,
        sha256: doc.sha256,
        folderName: doc.folders?.name ?? null,
        trashed: Boolean(doc.trashed_at),
        versions: (doc.document_versions ?? [])
          .sort((a, b) => b.version - a.version)
          .map((v) => ({
            version: v.version,
            sha256: v.sha256,
            createdAt: v.created_at,
            note: v.note,
          })),
      }}
    />
  );
}
