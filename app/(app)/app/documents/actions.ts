"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { recordAudit } from "@/lib/audit";
import { guard, type GuardDenial } from "@/lib/auth/account";
import { sha256Hex } from "@/lib/crypto";
import { gotenbergConverter } from "@/lib/documents/convert";
import { fetchDocumentFromUrl, FetchUrlError } from "@/lib/documents/fetch-url";
import { MAX_UPLOAD_BYTES } from "@/lib/documents/limits";
import { documentPaths, extensionOf, titleFromFileName } from "@/lib/documents/paths";
import { processDocument, ProcessError, type ProcessErrorCode } from "@/lib/documents/process";
import { sanitizeFileName } from "@/lib/files/sniff";
import { rateLimit } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

type Fail<E extends string = string> = { ok: false; error: E };
export type DocumentActionError =
  | GuardDenial
  | ProcessErrorCode
  | "storage_full"
  | "not_found"
  | "server"
  | "invalid"
  | "rate_limited";

const uuid = z.uuid();

// ---------------------------------------------------------------------------
// Import : 1) URL d'envoi signée → 2) envoi direct navigateur → stockage → 3) finalisation
// ---------------------------------------------------------------------------

const prepareSchema = z.object({
  fileName: z.string().min(1).max(255),
  size: z.number().int().positive(),
});

export async function prepareUpload(
  input: unknown,
): Promise<{ ok: true; documentId: string; signedUrl: string } | Fail<DocumentActionError>> {
  const parsed = prepareSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  if (parsed.data.size > MAX_UPLOAD_BYTES) return { ok: false, error: "too_large" };

  // Accès gratuit : un document conservé (quota documentsStored).
  const access = await guard("upload", { kind: "documentsStored" });
  if (!access.ok) return { ok: false, error: access.reason };
  const { account } = access;
  // Imports nombreux en peu de temps (script, boucle) : pause, sans gêner un usage normal.
  if (!(await rateLimit("upload", account.userId, 60, 3600)))
    return { ok: false, error: "rate_limited" };
  if (account.entitlements.remaining.storageBytes < parsed.data.size)
    return { ok: false, error: "storage_full" };

  const documentId = randomUUID();
  const path = documentPaths.original(
    account.userId,
    documentId,
    extensionOf(parsed.data.fileName),
  );
  const { data, error } = await createAdminClient()
    .storage.from("documents")
    .createSignedUploadUrl(path);
  if (error || !data) {
    console.error("[documents] URL d'envoi", error);
    return { ok: false, error: "server" };
  }
  return { ok: true, documentId, signedUrl: data.signedUrl };
}

const finalizeSchema = z.object({
  documentId: uuid,
  fileName: z.string().min(1).max(255),
  folderId: uuid.nullish(),
});

export async function finalizeUpload(
  input: unknown,
): Promise<{ ok: true; documentId: string; kind: string } | Fail<DocumentActionError>> {
  const parsed = finalizeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const access = await guard("upload", { kind: "documentsStored" });
  if (!access.ok) return { ok: false, error: access.reason };

  const { documentId, fileName, folderId } = parsed.data;
  const userId = access.account.userId;
  const originalPath = documentPaths.original(userId, documentId, extensionOf(fileName));

  const admin = createAdminClient();
  const { data: blob, error: downloadError } = await admin.storage
    .from("documents")
    .download(originalPath);
  if (downloadError || !blob) return { ok: false, error: "not_found" };

  return ingest({
    userId,
    documentId,
    fileName,
    folderId: folderId ?? null,
    bytes: new Uint8Array(await blob.arrayBuffer()),
    originalPath,
  });
}

/** Import depuis un lien public (Google Drive, Dropbox, site web…). */
export async function importFromUrl(
  input: unknown,
): Promise<
  { ok: true; documentId: string; kind: string } | Fail<DocumentActionError | FetchUrlError["code"]>
> {
  const parsed = z
    .object({ url: z.string().trim().min(8).max(2048), folderId: uuid.nullish() })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_url" };
  const access = await guard("upload", { kind: "documentsStored" });
  if (!access.ok) return { ok: false, error: access.reason };
  const userId = access.account.userId;
  if (!(await rateLimit("import-url", userId, 20, 3600)))
    return { ok: false, error: "rate_limited" };

  let fetched: Awaited<ReturnType<typeof fetchDocumentFromUrl>>;
  try {
    fetched = await fetchDocumentFromUrl(parsed.data.url);
  } catch (error) {
    return { ok: false, error: error instanceof FetchUrlError ? error.code : "failed" };
  }
  if (access.account.entitlements.remaining.storageBytes < fetched.bytes.byteLength) {
    return { ok: false, error: "storage_full" };
  }

  const documentId = randomUUID();
  const fileName = sanitizeFileName(fetched.fileName);
  return ingest({
    userId,
    documentId,
    fileName,
    folderId: parsed.data.folderId ?? null,
    bytes: fetched.bytes,
    originalPath: null,
  });
}

/**
 * Vérifie le contenu réel, convertit en PDF si besoin, stocke le PDF de travail
 * (version 0) et crée le document. L'original est toujours conservé.
 */
async function ingest({
  userId,
  documentId,
  fileName,
  folderId,
  bytes,
  originalPath: uploadedPath,
}: {
  userId: string;
  documentId: string;
  fileName: string;
  folderId: string | null;
  bytes: Uint8Array;
  originalPath: string | null;
}): Promise<{ ok: true; documentId: string; kind: string } | Fail<DocumentActionError>> {
  const admin = createAdminClient();
  const cleanName = sanitizeFileName(fileName);

  let processed: Awaited<ReturnType<typeof processDocument>>;
  try {
    processed = await processDocument(bytes, gotenbergConverter);
  } catch (error) {
    if (uploadedPath) await admin.storage.from("documents").remove([uploadedPath]);
    if (error instanceof ProcessError) return { ok: false, error: error.code };
    console.error("[documents] traitement", error);
    return { ok: false, error: "server" };
  }

  // L'original est rangé sous son extension réelle (et non celle annoncée).
  const originalPath = documentPaths.original(
    userId,
    documentId,
    processed.detected === "jpeg" ? "jpg" : processed.detected,
  );
  if (uploadedPath && uploadedPath !== originalPath) {
    await admin.storage.from("documents").move(uploadedPath, originalPath);
  } else if (!uploadedPath) {
    await admin.storage
      .from("documents")
      .upload(originalPath, bytes, { contentType: mimeOf(processed.detected) });
  }

  let pdfPath = originalPath;
  let totalSize = bytes.byteLength;
  if (processed.kind !== "pdf") {
    pdfPath = documentPaths.pdf(userId, documentId);
    const { error } = await admin.storage
      .from("documents")
      .upload(pdfPath, processed.pdf, { contentType: "application/pdf", upsert: true });
    if (error) {
      console.error("[documents] stockage du PDF", error);
      return { ok: false, error: "server" };
    }
    totalSize += processed.pdf.byteLength;
  }

  const sha256 = sha256Hex(processed.pdf);
  if (folderId) {
    const { data: folder } = await admin
      .from("folders")
      .select("id")
      .eq("id", folderId)
      .eq("owner_id", userId)
      .maybeSingle();
    if (!folder) folderId = null;
  }

  const { error: insertError } = await admin.from("documents").insert({
    id: documentId,
    owner_id: userId,
    title: titleFromFileName(cleanName),
    folder_id: folderId,
    original_path: originalPath,
    original_type: processed.detected,
    original_name: cleanName,
    size_bytes: totalSize,
    pdf_path: pdfPath,
    page_count: processed.pageCount,
    status: "draft",
    current_version: 0,
    sha256,
  });
  if (insertError) {
    console.error("[documents] création", insertError);
    return { ok: false, error: insertError.code === "23505" ? "invalid" : "server" };
  }
  await admin.from("document_versions").insert({
    document_id: documentId,
    version: 0,
    file_path: pdfPath,
    sha256,
    created_by: userId,
    note:
      processed.kind === "word"
        ? "Conversion Word → PDF"
        : processed.kind === "image"
          ? "Image → PDF"
          : "Original",
  });
  await recordAudit({
    documentId,
    actorType: "user",
    actorId: userId,
    eventType: "document.imported",
    metadata: { kind: processed.kind, pages: processed.pageCount, sha256 },
  });

  revalidatePath("/app/documents");
  revalidatePath("/app");
  return { ok: true, documentId, kind: processed.kind };
}

function mimeOf(detected: string): string {
  return (
    {
      pdf: "application/pdf",
      docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      doc: "application/msword",
      odt: "application/vnd.oasis.opendocument.text",
      rtf: "application/rtf",
      jpeg: "image/jpeg",
      png: "image/png",
    }[detected] ?? "application/octet-stream"
  );
}

/** Vignette de la première page, générée par le navigateur (JPEG, ≤ 200 Ko). */
export async function saveThumbnail(documentId: string, dataUrl: string): Promise<{ ok: boolean }> {
  if (!uuid.safeParse(documentId).success || !dataUrl.startsWith("data:image/jpeg;base64,"))
    return { ok: false };
  const bytes = Buffer.from(dataUrl.slice("data:image/jpeg;base64,".length), "base64");
  if (bytes.byteLength > 200_000 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return { ok: false };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false };
  const { data: doc } = await supabase
    .from("documents")
    .select("id, owner_id")
    .eq("id", documentId)
    .maybeSingle();
  if (!doc || doc.owner_id !== user.id) return { ok: false };

  const path = documentPaths.thumbnail(user.id, documentId);
  const admin = createAdminClient();
  const { error } = await admin.storage
    .from("documents")
    .upload(path, bytes, { contentType: "image/jpeg", upsert: true });
  if (error) return { ok: false };
  await admin.from("documents").update({ thumbnail_path: path }).eq("id", documentId);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Organisation : renommer, déplacer, étiqueter, corbeille
// ---------------------------------------------------------------------------

async function userClient() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, userId: user?.id ?? null };
}

const idsSchema = z.array(uuid).min(1).max(200);

export async function renameDocument(documentId: string, title: string): Promise<{ ok: boolean }> {
  const parsed = z
    .object({ id: uuid, title: z.string().trim().min(1).max(200) })
    .safeParse({ id: documentId, title });
  if (!parsed.success) return { ok: false };
  const { supabase, userId } = await userClient();
  if (!userId) return { ok: false };
  const { error } = await supabase
    .from("documents")
    .update({ title: parsed.data.title })
    .eq("id", parsed.data.id);
  revalidatePath("/app/documents");
  return { ok: !error };
}

export async function moveDocuments(
  ids: string[],
  folderId: string | null,
): Promise<{ ok: boolean }> {
  if (!idsSchema.safeParse(ids).success || (folderId && !uuid.safeParse(folderId).success))
    return { ok: false };
  const { supabase, userId } = await userClient();
  if (!userId) return { ok: false };
  const { error } = await supabase.from("documents").update({ folder_id: folderId }).in("id", ids);
  revalidatePath("/app/documents");
  return { ok: !error };
}

export async function trashDocuments(ids: string[]): Promise<{ ok: boolean }> {
  if (!idsSchema.safeParse(ids).success) return { ok: false };
  const { supabase, userId } = await userClient();
  if (!userId) return { ok: false };
  const { error } = await supabase
    .from("documents")
    .update({ trashed_at: new Date().toISOString() })
    .in("id", ids);
  if (!error) {
    for (const id of ids)
      await recordAudit({
        documentId: id,
        actorType: "user",
        actorId: userId,
        eventType: "document.trashed",
      });
  }
  revalidatePath("/app/documents");
  revalidatePath("/app");
  return { ok: !error };
}

export async function restoreDocuments(ids: string[]): Promise<{ ok: boolean }> {
  if (!idsSchema.safeParse(ids).success) return { ok: false };
  const { supabase, userId } = await userClient();
  if (!userId) return { ok: false };
  const { error } = await supabase.from("documents").update({ trashed_at: null }).in("id", ids);
  if (!error) {
    for (const id of ids)
      await recordAudit({
        documentId: id,
        actorType: "user",
        actorId: userId,
        eventType: "document.restored",
      });
  }
  revalidatePath("/app/documents");
  return { ok: !error };
}

/** Suppression définitive (depuis la corbeille uniquement) : fichiers puis ligne. */
export async function deleteDocumentsForever(ids: string[]): Promise<{ ok: boolean }> {
  if (!idsSchema.safeParse(ids).success) return { ok: false };
  const { supabase, userId } = await userClient();
  if (!userId) return { ok: false };
  const { data: docs } = await supabase
    .from("documents")
    .select("id")
    .in("id", ids)
    .eq("owner_id", userId)
    .not("trashed_at", "is", null);
  if (!docs?.length) return { ok: false };

  const admin = createAdminClient();
  for (const doc of docs) {
    const folder = documentPaths.folder(userId, doc.id);
    const { data: files } = await admin.storage.from("documents").list(folder, { limit: 1000 });
    if (files?.length)
      await admin.storage.from("documents").remove(files.map((f) => `${folder}/${f.name}`));
  }
  const { error } = await supabase
    .from("documents")
    .delete()
    .in(
      "id",
      docs.map((d) => d.id),
    );
  if (!error) {
    // Le journal garde la trace de la suppression (jamais le contenu du document).
    for (const doc of docs)
      await recordAudit({
        documentId: doc.id,
        actorType: "user",
        actorId: userId,
        eventType: "document.deleted",
      });
  }
  revalidatePath("/app/documents");
  return { ok: !error };
}

// ---------------------------------------------------------------------------
// Dossiers et étiquettes
// ---------------------------------------------------------------------------

const nameSchema = z.string().trim().min(1).max(120);
const TAG_COLORS = ["indigo", "violet", "cyan", "emerald", "amber", "rose", "slate"] as const;

export async function createFolder(
  name: string,
): Promise<{ ok: true; id: string } | { ok: false }> {
  const parsed = nameSchema.safeParse(name);
  if (!parsed.success) return { ok: false };
  const { supabase, userId } = await userClient();
  if (!userId) return { ok: false };
  const { data, error } = await supabase
    .from("folders")
    .insert({ owner_id: userId, name: parsed.data })
    .select("id")
    .single();
  revalidatePath("/app/documents");
  return error || !data ? { ok: false } : { ok: true, id: data.id };
}

export async function renameFolder(folderId: string, name: string): Promise<{ ok: boolean }> {
  const parsed = nameSchema.safeParse(name);
  if (!parsed.success || !uuid.safeParse(folderId).success) return { ok: false };
  const { supabase } = await userClient();
  const { error } = await supabase.from("folders").update({ name: parsed.data }).eq("id", folderId);
  revalidatePath("/app/documents");
  return { ok: !error };
}

/** Supprime un dossier ; ses documents reviennent à la racine (aucun document supprimé). */
export async function deleteFolder(folderId: string): Promise<{ ok: boolean }> {
  if (!uuid.safeParse(folderId).success) return { ok: false };
  const { supabase } = await userClient();
  const { error } = await supabase.from("folders").delete().eq("id", folderId);
  revalidatePath("/app/documents");
  return { ok: !error };
}

export async function createTag(
  name: string,
  color: string,
): Promise<{ ok: true; id: string } | { ok: false }> {
  const parsed = z
    .object({ name: z.string().trim().min(1).max(40), color: z.enum(TAG_COLORS) })
    .safeParse({ name, color });
  if (!parsed.success) return { ok: false };
  const { supabase, userId } = await userClient();
  if (!userId) return { ok: false };
  const { data, error } = await supabase
    .from("tags")
    .insert({ owner_id: userId, name: parsed.data.name, color: parsed.data.color })
    .select("id")
    .single();
  revalidatePath("/app/documents");
  return error || !data ? { ok: false } : { ok: true, id: data.id };
}

export async function deleteTag(tagId: string): Promise<{ ok: boolean }> {
  if (!uuid.safeParse(tagId).success) return { ok: false };
  const { supabase } = await userClient();
  const { error } = await supabase.from("tags").delete().eq("id", tagId);
  revalidatePath("/app/documents");
  return { ok: !error };
}

/** Ajoute (ou retire) une étiquette sur plusieurs documents. */
export async function setTag(
  ids: string[],
  tagId: string,
  apply: boolean,
): Promise<{ ok: boolean }> {
  if (!idsSchema.safeParse(ids).success || !uuid.safeParse(tagId).success) return { ok: false };
  const { supabase } = await userClient();
  const { error } = apply
    ? await supabase.from("document_tags").upsert(
        ids.map((id) => ({ document_id: id, tag_id: tagId })),
        { ignoreDuplicates: true },
      )
    : await supabase.from("document_tags").delete().in("document_id", ids).eq("tag_id", tagId);
  revalidatePath("/app/documents");
  return { ok: !error };
}

// ---------------------------------------------------------------------------
// Accès aux fichiers : URL signées de courte durée
// ---------------------------------------------------------------------------

export async function getDocumentFileUrl(
  documentId: string,
  which: "pdf" | "original" = "pdf",
  download = false,
): Promise<{ ok: true; url: string } | { ok: false }> {
  if (!uuid.safeParse(documentId).success) return { ok: false };
  const { supabase, userId } = await userClient();
  if (!userId) return { ok: false };
  // Autorisation : la RLS ne renvoie le document qu'à son propriétaire (ou à son équipe) ;
  // un document à la corbeille n'est plus accessible (le restaurer d'abord).
  const { data: doc } = await supabase
    .from("documents")
    .select("title, pdf_path, original_path, original_type, trashed_at")
    .eq("id", documentId)
    .maybeSingle();
  const path = which === "pdf" ? doc?.pdf_path : doc?.original_path;
  if (!doc || !path || doc.trashed_at) return { ok: false };
  // Le chemin vient de la base, jamais du client : on vérifie tout de même qu'il reste
  // dans l'espace de stockage du document (aucune traversée de chemin possible).
  if (!path.split("/").includes(documentId) || path.includes("..")) return { ok: false };

  const ext = which === "pdf" ? "pdf" : path.split(".").pop();
  const { data, error } = await createAdminClient()
    .storage.from("documents")
    .createSignedUrl(
      path,
      300,
      download ? { download: `${sanitizeFileName(doc.title)}.${ext}` } : undefined,
    );
  if (error || !data) return { ok: false };
  if (download) {
    await recordAudit({
      documentId,
      actorType: "user",
      actorId: userId,
      eventType: "document.downloaded",
      metadata: { file: which },
    });
  }
  return { ok: true, url: data.signedUrl };
}
