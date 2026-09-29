import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { RequestBuilder, type BuilderField } from "@/components/requests/request-builder";
import { requireAccount } from "@/lib/auth/account";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { templateFieldSchema, templateRoleSchema } from "@/lib/templates/schema";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("templates");
  return { title: t("editTitle") };
}

/** Définition d'un modèle : rôles, zones (dont champs variables), ordre de signature. */
export default async function EditTemplatePage(props: PageProps<"/app/modeles/[id]/editer">) {
  const [{ id }, account] = await Promise.all([props.params, requireAccount()]);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  if (!account.entitlements.features.templates) redirect("/app/modeles");
  const supabase = await createClient();
  const { data: template } = await supabase.from("templates").select("*").eq("id", id).maybeSingle();
  if (!template || template.owner_id !== account.userId || !template.pdf_path) notFound();
  const { data: signed } = await createAdminClient().storage.from("documents").createSignedUrl(template.pdf_path, 3600);
  if (!signed) notFound();

  const roles = templateRoleSchema.array().safeParse(template.roles);
  const fields = templateFieldSchema.array().safeParse(template.fields);
  return (
    <RequestBuilder
      document={{ id: template.source_document_id ?? template.id, title: template.name }}
      pdfUrl={signed.signedUrl}
      template={{ id: template.id, name: template.name }}
      preset={{
        mode: template.mode as "sequential" | "parallel",
        signers: (roles.success && roles.data.length ? roles.data : [{ label: "" }]).map((r) => ({ name: r.label, email: "", phone: "" })),
        fields: (fields.success ? fields.data : []).map((f): BuilderField => ({
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
          variable: f.variable,
        })),
      }}
    />
  );
}
