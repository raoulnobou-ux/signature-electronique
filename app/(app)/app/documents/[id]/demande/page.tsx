import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { AssistantRequestBuilder } from "@/components/assistant/assistant-request-builder";
import {
  RequestBuilder,
  type BuilderField,
  type BuilderPreset,
} from "@/components/requests/request-builder";
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

  // Brouillon repris : signataires, zones, message et durée tels qu'enregistrés.
  const draftId = searchParams.brouillon;
  if (typeof draftId === "string" && /^[0-9a-f-]{36}$/i.test(draftId)) {
    const draft = await draftPreset(draftId, doc.id, account.userId);
    if (!draft) redirect("/app/demandes");
    return (
      <RequestBuilder
        document={{ id: doc.id, title: doc.title }}
        pdfUrl={signed.signedUrl}
        preset={draft}
        draftId={draftId}
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

/** Contenu d'un brouillon de demande appartenant à l'utilisateur, pour le reprendre. */
async function draftPreset(
  draftId: string,
  documentId: string,
  userId: string,
): Promise<BuilderPreset | null> {
  const admin = createAdminClient();
  const { data: draft } = await admin
    .from("signature_requests")
    .select("id, mode, message, created_at, expires_at")
    .eq("id", draftId)
    .eq("owner_id", userId)
    .eq("document_id", documentId)
    .eq("status", "draft")
    .maybeSingle();
  if (!draft) return null;
  const { data: signers } = await admin
    .from("request_signers")
    .select("id, name, email, phone, order_index")
    .eq("request_id", draft.id)
    .order("order_index");
  const ids = (signers ?? []).map((s) => s.id);
  const { data: fields } = ids.length
    ? await admin.from("placed_fields").select("*").in("request_signer_id", ids)
    : { data: [] };
  const days = draft.expires_at
    ? Math.round(
        (new Date(draft.expires_at).getTime() - new Date(draft.created_at).getTime()) / 86_400_000,
      )
    : 14;
  return {
    mode: draft.mode as "sequential" | "parallel",
    message: draft.message ?? "",
    // Durée la plus proche parmi celles proposées dans le formulaire.
    days: [3, 7, 14, 30, 60].reduce((best, d) =>
      Math.abs(d - days) < Math.abs(best - days) ? d : best,
    ),
    signers: (signers ?? []).map((s) => ({
      name: s.name,
      email: s.email ?? "",
      phone: s.phone ?? "",
    })),
    fields: (fields ?? []).map((f) => ({
      id: f.id.slice(0, 12),
      page: f.page,
      x: f.x_pct,
      y: f.y_pct,
      w: f.w_pct,
      h: f.h_pct,
      rotation: f.rotation,
      opacity: f.opacity,
      type: f.type as BuilderField["type"],
      assetId: null,
      value: f.value,
      signer: ids.indexOf(f.request_signer_id!),
      required: f.required,
    })),
  };
}
