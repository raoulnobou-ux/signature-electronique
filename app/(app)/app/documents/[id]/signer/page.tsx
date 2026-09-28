import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Editor } from "@/components/editor/editor";
import type { EditorField } from "@/components/editor/state";
import { requireAccount } from "@/lib/auth/account";
import { formatSignatureDate, type FieldType } from "@/lib/pdf/fields";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { listSignatureAssets } from "../../../signatures/actions";

export async function generateMetadata(props: PageProps<"/app/documents/[id]/signer">): Promise<Metadata> {
  const { id } = await props.params;
  const [supabase, t] = await Promise.all([createClient(), getTranslations("editor")]);
  const { data } = await supabase.from("documents").select("title").eq("id", id).maybeSingle();
  return { title: t("metaTitle", { title: data?.title ?? "Document" }) };
}

export default async function SignerPage(props: PageProps<"/app/documents/[id]/signer">) {
  const [{ id }, account] = await Promise.all([props.params, requireAccount()]);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  // Compte en lecture seule : retour à la fiche (le bandeau explique pourquoi).
  if (account.entitlements.readOnly) redirect(`/app/documents/${id}`);

  const supabase = await createClient();
  const { data: doc } = await supabase
    .from("documents")
    .select("id, title, pdf_path, page_count, trashed_at, owner_id, status")
    .eq("id", id)
    .maybeSingle();
  if (!doc || !doc.pdf_path || doc.trashed_at || doc.owner_id !== account.userId) notFound();
  // Demande de signature en cours : le document est figé jusqu'à la fin de la demande.
  if (doc.status === "pending") redirect(`/app/documents/${id}`);

  const [{ data: signed }, { data: draft }, assets] = await Promise.all([
    createAdminClient().storage.from("documents").createSignedUrl(doc.pdf_path, 3600),
    supabase.from("placed_fields").select("*").eq("document_id", id).is("request_signer_id", null).order("created_at"),
    listSignatureAssets(),
  ]);
  if (!signed) notFound();

  const initialFields: EditorField[] = (draft ?? []).map((f) => ({
    id: f.id.slice(0, 12),
    page: f.page,
    x: f.x_pct,
    y: f.y_pct,
    w: f.w_pct,
    h: f.h_pct,
    rotation: f.rotation,
    opacity: f.opacity,
    type: f.type as FieldType,
    assetId: f.asset_id,
    value: f.value,
  }));

  return (
    <Editor
      document={{ id: doc.id, title: doc.title, pageCount: doc.page_count ?? 1 }}
      pdfUrl={signed.signedUrl}
      initialFields={initialFields.filter((f) => !f.assetId || assets.some((a) => a.id === f.assetId))}
      assets={assets}
      stampsAllowed={account.entitlements.features.stamps}
      defaults={{
        name: account.profile.full_name,
        dateLabel: formatSignatureDate(new Date(), account.profile.timezone, account.profile.city),
      }}
    />
  );
}
