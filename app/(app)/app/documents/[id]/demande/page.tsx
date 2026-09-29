import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { AssistantRequestBuilder } from "@/components/assistant/assistant-request-builder";
import { RequestBuilder, type BuilderPreset } from "@/components/requests/request-builder";
import { templatePreset } from "../../../modeles/actions";
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
  const { data: signed } = await createAdminClient()
    .storage.from("documents")
    .createSignedUrl(doc.pdf_path, 3600);
  if (!signed) notFound();

  const searchParams = await props.searchParams;
  // Demande préparée par l'assistant : zones et signataires lus dans le navigateur.
  if (searchParams.assistant === "1") {
    return (
      <AssistantRequestBuilder
        document={{ id: doc.id, title: doc.title }}
        pdfUrl={signed.signedUrl}
      />
    );
  }

  // Demande préparée depuis un modèle : rôles et zones préremplis.
  const templateId = searchParams.modele;
  const fromTemplate =
    typeof templateId === "string" && /^[0-9a-f-]{36}$/i.test(templateId)
      ? await templatePreset(templateId)
      : null;
  const preset: BuilderPreset | undefined = fromTemplate
    ? {
        mode: fromTemplate.mode,
        signers: fromTemplate.roles.map((role) => ({ name: "", email: "", phone: "", role })),
        fields: fromTemplate.fields.map((f) => ({
          id: f.id,
          page: f.page,
          x: f.x,
          y: f.y,
          w: f.w,
          h: f.h,
          rotation: 0,
          opacity: 1,
          type: f.type,
          assetId: null,
          value: f.value ?? null,
          signer: f.signer,
          required: f.required,
        })),
      }
    : undefined;

  return (
    <RequestBuilder
      document={{ id: doc.id, title: doc.title }}
      pdfUrl={signed.signedUrl}
      preset={preset}
    />
  );
}
