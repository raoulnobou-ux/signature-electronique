"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { recordAudit } from "@/lib/audit";
import { guard, type GuardDenial } from "@/lib/auth/account";
import { sha256Hex } from "@/lib/crypto";
import { documentPaths } from "@/lib/documents/paths";
import { fieldsSchema, formatSignatureDate, isImageField, type Field } from "@/lib/pdf/fields";
import { stampPdf } from "@/lib/pdf/stamp";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const uuid = z.uuid();

/** Enregistre le brouillon de l'éditeur (remplace les champs du propriétaire). */
export async function saveDraft(documentId: string, input: unknown): Promise<{ ok: boolean }> {
  const fields = fieldsSchema.safeParse(input);
  if (!uuid.safeParse(documentId).success || !fields.success) return { ok: false };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false };

  // La RLS vérifie que le document appartient à l'utilisateur et que le compte est actif.
  const { error: deleteError } = await supabase
    .from("placed_fields")
    .delete()
    .eq("document_id", documentId)
    .is("request_signer_id", null);
  if (deleteError) return { ok: false };
  if (fields.data.length === 0) return { ok: true };

  const { error } = await supabase.from("placed_fields").insert(
    fields.data.map((f) => ({
      document_id: documentId,
      page: f.page,
      x_pct: f.x,
      y_pct: f.y,
      w_pct: f.w,
      h_pct: f.h,
      rotation: f.rotation,
      opacity: f.opacity,
      type: f.type,
      asset_id: f.assetId ?? null,
      value: f.value ?? null,
    })),
  );
  return { ok: !error };
}

export type FinalizeError =
  | GuardDenial
  | "invalid"
  | "not_found"
  | "already_signed"
  | "no_fields"
  | "asset_not_found"
  | "request_pending"
  | "server";

export type FinalizeResult =
  | {
      ok: true;
      version: number;
      sha256: string;
      downloadUrl: string;
      fileName: string;
      signedAt: string;
    }
  | { ok: false; error: FinalizeError };

/**
 * « Finaliser et signer » : applique les champs sur le PDF côté serveur (source de confiance),
 * horodate, calcule l'empreinte, crée une nouvelle version. L'original reste intact.
 */
export async function finalizeSignature(
  documentId: string,
  input: unknown,
  options: { timestampFooter: boolean },
): Promise<FinalizeResult> {
  const parsed = fieldsSchema.safeParse(input);
  if (!uuid.safeParse(documentId).success || !parsed.success)
    return { ok: false, error: "invalid" };
  const fields = parsed.data;
  if (fields.length === 0) return { ok: false, error: "no_fields" };

  // Droits : compte actif, e-mail vérifié, quota mensuel ; cachet réservé au Pro.
  const access = await guard("sign", { kind: "documentsThisMonth" });
  if (!access.ok) return { ok: false, error: access.reason };
  const { account } = access;
  if (fields.some((f) => f.type === "stamp") && !account.entitlements.features.stamps) {
    return { ok: false, error: "feature_not_in_plan" };
  }

  const supabase = await createClient();
  const { data: doc } = await supabase
    .from("documents")
    .select("id, owner_id, title, pdf_path, page_count, current_version, status, trashed_at")
    .eq("id", documentId)
    .maybeSingle();
  if (!doc || doc.owner_id !== account.userId || !doc.pdf_path || doc.trashed_at)
    return { ok: false, error: "not_found" };
  if (doc.status === "pending") return { ok: false, error: "request_pending" };
  if (fields.some((f) => f.page >= (doc.page_count ?? 0))) return { ok: false, error: "invalid" };

  // Images : uniquement les actifs de l'utilisateur (ou partagés par son équipe, via la RLS).
  const assetIds = [...new Set(fields.filter((f) => isImageField(f.type)).map((f) => f.assetId!))];
  const admin = createAdminClient();
  const images = new Map<string, Uint8Array>();
  if (assetIds.length) {
    const { data: assets } = await supabase
      .from("signature_assets")
      .select("id, type, image_path")
      .in("id", assetIds);
    if ((assets?.length ?? 0) !== assetIds.length) return { ok: false, error: "asset_not_found" };
    for (const asset of assets!) {
      const { data: blob } = await admin.storage.from("signatures").download(asset.image_path);
      if (!blob) return { ok: false, error: "asset_not_found" };
      images.set(asset.id, new Uint8Array(await blob.arrayBuffer()));
    }
  }

  const { data: source } = await admin.storage.from("documents").download(doc.pdf_path);
  if (!source) return { ok: false, error: "not_found" };
  const sourceBytes = new Uint8Array(await source.arrayBuffer());
  const sourceSha = sha256Hex(sourceBytes);

  const signedAt = new Date();
  const timezone = account.profile.timezone;
  const en = account.profile.locale === "en";
  const when = new Intl.DateTimeFormat(en ? "en-GB" : "fr-FR", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: timezone,
  }).format(signedAt);
  const reference = documentId.slice(0, 8).toUpperCase();
  const signer = account.profile.full_name || account.email;

  let signedBytes: Uint8Array;
  try {
    signedBytes = await stampPdf(sourceBytes, fields as Field[], {
      images,
      footer: options.timestampFooter
        ? en
          ? `Electronically signed by ${signer} with QuickSign — ${when} (${timezone}) — Ref. ${reference}`
          : `Signé électroniquement par ${signer} avec QuickSign — ${when} (${timezone}) — Réf. ${reference}`
        : null,
      metadata: { author: signer, title: doc.title, signedAt },
    });
  } catch (error) {
    console.error("[signature] génération du PDF", error);
    return { ok: false, error: "server" };
  }

  const version = doc.current_version + 1;
  const sha256 = sha256Hex(signedBytes);
  const path = documentPaths.version(account.userId, documentId, version);
  const { error: uploadError } = await admin.storage
    .from("documents")
    .upload(path, signedBytes, { contentType: "application/pdf", upsert: false });
  if (uploadError) {
    console.error("[signature] stockage", uploadError);
    return { ok: false, error: "server" };
  }

  // Mise à jour conditionnelle sur la version : deux finalisations simultanées ne peuvent
  // pas créer deux versions concurrentes (un document signé peut être re-signé : version suivante).
  const { data: updated, error: updateError } = await admin
    .from("documents")
    .update({
      status: "signed",
      current_version: version,
      pdf_path: path,
      sha256,
      signed_at: signedAt.toISOString(),
      size_bytes: (await currentSize(documentId)) + signedBytes.byteLength,
    })
    .eq("id", documentId)
    .eq("current_version", doc.current_version)
    .select("id")
    .maybeSingle();
  if (updateError || !updated) {
    await admin.storage.from("documents").remove([path]);
    return { ok: false, error: updateError ? "server" : "already_signed" };
  }

  await admin.from("document_versions").insert({
    document_id: documentId,
    version,
    file_path: path,
    sha256,
    created_by: account.userId,
    note: "Signé",
  });
  await admin
    .from("placed_fields")
    .delete()
    .eq("document_id", documentId)
    .is("request_signer_id", null);
  await admin.rpc("increment_usage", {
    p_user_id: account.userId,
    p_kind: "documents_signed",
    p_amount: 1,
  });
  await recordAudit({
    documentId,
    actorType: "user",
    actorId: account.userId,
    actorLabel: signer,
    eventType: "document.signed",
    metadata: {
      version,
      sha256_before: sourceSha,
      sha256_after: sha256,
      fields: fields.length,
      field_types: [...new Set(fields.map((f) => f.type))],
      timestamp_footer: options.timestampFooter,
      signed_at: signedAt.toISOString(),
      timezone,
    },
  });

  const fileName = `${doc.title.replace(/[\\/:*?"<>|]/g, "").slice(0, 150)} (signé).pdf`;
  const { data: signed } = await admin.storage
    .from("documents")
    .createSignedUrl(path, 3600, { download: fileName });

  revalidatePath(`/app/documents/${documentId}`);
  revalidatePath("/app/documents");
  revalidatePath("/app");
  return {
    ok: true,
    version,
    sha256,
    downloadUrl: signed?.signedUrl ?? "",
    fileName,
    signedAt: signedAt.toISOString(),
  };
}

async function currentSize(documentId: string): Promise<number> {
  const { data } = await createAdminClient()
    .from("documents")
    .select("size_bytes")
    .eq("id", documentId)
    .single();
  return data?.size_bytes ?? 0;
}

/** Date préremplie pour le champ « Date » (fuseau et ville de l'utilisateur). */
export async function todayLabel(): Promise<string> {
  const access = await guard("sign");
  if (!access.ok) return formatSignatureDate(new Date(), "Africa/Douala");
  const { profile } = access.account;
  return formatSignatureDate(new Date(), profile.timezone, profile.city, profile.locale);
}
