"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { recordAudit } from "@/lib/audit";
import { getCurrentAccount, guard, type GuardDenial } from "@/lib/auth/account";
import { sha256Hex } from "@/lib/crypto";
import { documentPaths } from "@/lib/documents/paths";
import type { Field } from "@/lib/pdf/fields";
import { stampPdf } from "@/lib/pdf/stamp";
import { MAX_SIGNERS } from "@/lib/requests/fields";
import { createAdminClient } from "@/lib/supabase/admin";
import { templateFieldSchema, templateRoleSchema, type TemplateField } from "@/lib/templates/schema";

type Fail<E extends string = string> = { ok: false; error: E };
const uuid = z.uuid();
const templatePath = (ownerId: string, templateId: string) => `${ownerId}/templates/${templateId}.pdf`;

/** « Enregistrer comme modèle » : copie du PDF de travail, puis définition des rôles et zones. */
export async function createTemplateFromDocument(
  documentId: string,
  input: { name: string; description?: string },
): Promise<{ ok: true; templateId: string } | Fail<GuardDenial | "invalid" | "not_found" | "server">> {
  const parsed = z.object({ name: z.string().trim().min(1).max(120), description: z.string().trim().max(500).optional() }).safeParse(input);
  if (!uuid.safeParse(documentId).success || !parsed.success) return { ok: false, error: "invalid" };
  const access = await guard("templates");
  if (!access.ok) return { ok: false, error: access.reason };
  const userId = access.account.userId;
  const admin = createAdminClient();
  const { data: doc } = await admin
    .from("documents")
    .select("id, owner_id, pdf_path, page_count, trashed_at")
    .eq("id", documentId)
    .maybeSingle();
  if (!doc || doc.owner_id !== userId || !doc.pdf_path || doc.trashed_at) return { ok: false, error: "not_found" };

  const templateId = randomUUID();
  const path = templatePath(userId, templateId);
  const { error: copyError } = await admin.storage.from("documents").copy(doc.pdf_path, path);
  if (copyError) {
    console.error("[modèles] copie du PDF", copyError);
    return { ok: false, error: "server" };
  }
  const { error } = await admin.from("templates").insert({
    id: templateId,
    owner_id: userId,
    name: parsed.data.name,
    description: parsed.data.description || null,
    source_document_id: doc.id,
    pdf_path: path,
    page_count: doc.page_count,
    roles: [{ label: "Signataire 1" }],
    fields: [],
  });
  if (error) {
    await admin.storage.from("documents").remove([path]);
    return { ok: false, error: "server" };
  }
  await recordAudit({ documentId: doc.id, actorType: "user", actorId: userId, eventType: "template.created", metadata: { template_id: templateId } });
  revalidatePath("/app/modeles");
  return { ok: true, templateId };
}

const saveSchema = z.object({
  name: z.string().trim().min(1).max(120),
  mode: z.enum(["sequential", "parallel"]),
  roles: z.array(templateRoleSchema).min(1).max(MAX_SIGNERS),
  fields: z.array(templateFieldSchema).max(300),
});

async function ownedTemplate(templateId: string) {
  if (!uuid.safeParse(templateId).success) return null;
  const account = await getCurrentAccount();
  if (!account) return null;
  const admin = createAdminClient();
  const { data } = await admin.from("templates").select("*").eq("id", templateId).maybeSingle();
  if (!data) return null;
  // Lecture : propriétaire, ou membre de l'équipe avec laquelle le modèle est partagé.
  if (data.owner_id !== account.userId) {
    if (!data.team_id) return null;
    const { data: member } = await admin.from("team_members").select("user_id").eq("team_id", data.team_id).eq("user_id", account.userId).maybeSingle();
    if (!member) return null;
  }
  return { account, template: data };
}

export async function saveTemplate(templateId: string, input: z.input<typeof saveSchema>): Promise<{ ok: true } | Fail<GuardDenial | "invalid" | "not_found" | "missing_fields">> {
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const access = await guard("templates");
  if (!access.ok) return { ok: false, error: access.reason };
  const owned = await ownedTemplate(templateId);
  if (!owned || owned.template.owner_id !== access.account.userId) return { ok: false, error: "not_found" };
  const { roles, fields } = parsed.data;
  if (fields.some((f) => f.signer >= roles.length || f.page >= (owned.template.page_count ?? 0))) return { ok: false, error: "invalid" };
  for (let i = 0; i < roles.length; i++) {
    if (!fields.some((f) => f.signer === i && !f.variable && (f.type === "signature" || f.type === "initials"))) {
      return { ok: false, error: "missing_fields" };
    }
  }
  await createAdminClient()
    .from("templates")
    .update({ name: parsed.data.name, mode: parsed.data.mode, roles, fields })
    .eq("id", templateId);
  revalidatePath("/app/modeles");
  return { ok: true };
}

export async function deleteTemplate(templateId: string): Promise<{ ok: boolean }> {
  const owned = await ownedTemplate(templateId);
  if (!owned || owned.template.owner_id !== owned.account.userId) return { ok: false };
  const admin = createAdminClient();
  await admin.from("templates").delete().eq("id", templateId);
  if (owned.template.pdf_path) await admin.storage.from("documents").remove([owned.template.pdf_path]);
  revalidatePath("/app/modeles");
  return { ok: true };
}

/** Partage avec son équipe (ou retrait du partage). */
export async function setTemplateShared(templateId: string, shared: boolean): Promise<{ ok: boolean }> {
  const owned = await ownedTemplate(templateId);
  if (!owned || owned.template.owner_id !== owned.account.userId) return { ok: false };
  const admin = createAdminClient();
  const { data: membership } = await admin.from("team_members").select("team_id").eq("user_id", owned.account.userId).maybeSingle();
  if (shared && !membership) return { ok: false };
  await admin.from("templates").update({ team_id: shared ? membership!.team_id : null }).eq("id", templateId);
  if (shared) {
    await recordAudit({ actorType: "user", actorId: owned.account.userId, eventType: "template.shared", metadata: { template_id: templateId } });
  }
  revalidatePath("/app/modeles");
  return { ok: true };
}

/**
 * Création en un clic : nouvelle copie du document du modèle (les champs variables remplis
 * par l'expéditeur y sont apposés), prête à être envoyée aux signataires.
 */
export async function createDocumentFromTemplate(
  templateId: string,
  variables: Record<string, string>,
): Promise<{ ok: true; documentId: string } | Fail<GuardDenial | "invalid" | "not_found" | "missing_variable" | "server">> {
  const values = z.record(z.string().max(64), z.string().max(200)).safeParse(variables);
  if (!values.success) return { ok: false, error: "invalid" };
  const access = await guard("templates");
  if (!access.ok) return { ok: false, error: access.reason };
  const userId = access.account.userId;
  // Modèle personnel ou partagé par l'équipe (vérifié dans ownedTemplate).
  const owned = await ownedTemplate(templateId);
  if (!owned) return { ok: false, error: "not_found" };
  const { template } = owned;
  const admin = createAdminClient();
  if (!template.pdf_path) return { ok: false, error: "not_found" };

  const fields = templateFieldSchema.array().safeParse(template.fields);
  if (!fields.success) return { ok: false, error: "server" };
  const variableFields = fields.data.filter((f) => f.variable);
  const stamped: Field[] = [];
  for (const f of variableFields) {
    const value = (values.data[f.id] ?? "").trim();
    if (!value && f.required) return { ok: false, error: "missing_variable" };
    if (value) stamped.push({ id: f.id, page: f.page, x: f.x, y: f.y, w: f.w, h: f.h, rotation: 0, opacity: 1, type: "text", value, assetId: null });
  }

  const { data: blob } = await admin.storage.from("documents").download(template.pdf_path);
  if (!blob) return { ok: false, error: "not_found" };
  let bytes: Uint8Array = new Uint8Array(await blob.arrayBuffer());
  if (stamped.length) bytes = await stampPdf(bytes, stamped, { images: new Map(), footer: null, metadata: { title: template.name } });

  const documentId = randomUUID();
  const path = documentPaths.original(userId, documentId, "pdf");
  const { error: uploadError } = await admin.storage.from("documents").upload(path, bytes, { contentType: "application/pdf" });
  if (uploadError) return { ok: false, error: "server" };
  const sha256 = sha256Hex(bytes);
  const date = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeZone: access.account.profile.timezone }).format(new Date());
  const title = `${template.name} — ${date}`.slice(0, 200);
  const { error } = await admin.from("documents").insert({
    id: documentId,
    owner_id: userId,
    title,
    original_path: path,
    original_type: "pdf",
    original_name: `${template.name.replace(/[\\/:*?"<>|]/g, "").slice(0, 100)}.pdf`,
    size_bytes: bytes.byteLength,
    pdf_path: path,
    page_count: template.page_count,
    status: "draft",
    current_version: 0,
    sha256,
  });
  if (error) {
    await admin.storage.from("documents").remove([path]);
    return { ok: false, error: "server" };
  }
  await admin.from("document_versions").insert({ document_id: documentId, version: 0, file_path: path, sha256, created_by: userId, note: `Créé depuis le modèle « ${template.name} »` });
  await admin.from("templates").update({ use_count: template.use_count + 1 }).eq("id", template.id);
  await recordAudit({ documentId, actorType: "user", actorId: userId, eventType: "template.used", metadata: { template_id: template.id, variables: variableFields.length } });
  revalidatePath("/app/documents");
  return { ok: true, documentId };
}

/** Champs (hors variables) et rôles d'un modèle, pour préremplir une demande. */
export async function templatePreset(templateId: string): Promise<{ roles: string[]; mode: "sequential" | "parallel"; fields: TemplateField[] } | null> {
  const owned = await ownedTemplate(templateId);
  if (!owned) return null;
  const fields = templateFieldSchema.array().safeParse(owned.template.fields);
  const roles = templateRoleSchema.array().safeParse(owned.template.roles);
  if (!fields.success || !roles.success) return null;
  return {
    roles: roles.data.map((r) => r.label),
    mode: owned.template.mode as "sequential" | "parallel",
    fields: fields.data.filter((f) => !f.variable),
  };
}
