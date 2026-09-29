"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { renderDraftPdf } from "@/lib/ai/draft-pdf";
import { toDisplay, type DisplayMessage } from "@/lib/ai/conversations";
import { recordAudit } from "@/lib/audit";
import { guard } from "@/lib/auth/account";
import { sha256Hex } from "@/lib/crypto";
import { documentPaths } from "@/lib/documents/paths";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const uuid = z.uuid();

export async function listConversations(): Promise<
  { id: string; title: string; updatedAt: string }[]
> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("ai_conversations")
    .select("id, title, updated_at")
    .order("updated_at", { ascending: false })
    .limit(50);
  return (data ?? []).map((c) => ({ id: c.id, title: c.title, updatedAt: c.updated_at }));
}

/** Messages d'une conversation (la RLS garantit qu'elle appartient à l'utilisateur). */
export async function loadConversation(id: string): Promise<DisplayMessage[] | null> {
  if (!uuid.safeParse(id).success) return null;
  const supabase = await createClient();
  const { data: conversation } = await supabase
    .from("ai_conversations")
    .select("id")
    .eq("id", id)
    .maybeSingle();
  if (!conversation) return null;
  const { data } = await supabase
    .from("ai_messages")
    .select("id, role, content, tool_calls")
    .eq("conversation_id", id)
    .order("created_at")
    .order("id");
  return toDisplay(data ?? []);
}

export async function deleteConversation(id: string): Promise<{ ok: boolean }> {
  if (!uuid.safeParse(id).success) return { ok: false };
  const supabase = await createClient();
  const { error } = await supabase.from("ai_conversations").delete().eq("id", id);
  return { ok: !error };
}

/** Crée un PDF à partir d'un brouillon rédigé par l'assistant (action confirmée par l'utilisateur). */
export async function createDocumentFromDraft(input: {
  title: string;
  body: string;
}): Promise<{ ok: true; documentId: string } | { ok: false }> {
  const parsed = z
    .object({ title: z.string().trim().min(1).max(160), body: z.string().min(1).max(30_000) })
    .safeParse(input);
  if (!parsed.success) return { ok: false };
  const access = await guard("upload");
  if (!access.ok) return { ok: false };
  const userId = access.account.userId;
  const bytes = await renderDraftPdf(parsed.data.title, parsed.data.body);
  const documentId = randomUUID();
  const path = documentPaths.original(userId, documentId, "pdf");
  const admin = createAdminClient();
  const { error: uploadError } = await admin.storage
    .from("documents")
    .upload(path, bytes, { contentType: "application/pdf" });
  if (uploadError) return { ok: false };
  const sha256 = sha256Hex(bytes);
  const { PDFDocument } = await import("pdf-lib");
  const pageCount = (await PDFDocument.load(bytes)).getPageCount();
  const { error } = await admin.from("documents").insert({
    id: documentId,
    owner_id: userId,
    title: parsed.data.title.slice(0, 200),
    original_path: path,
    original_type: "pdf",
    original_name: `${parsed.data.title.replace(/[\\/:*?"<>|]/g, "").slice(0, 100)}.pdf`,
    size_bytes: bytes.byteLength,
    pdf_path: path,
    page_count: pageCount,
    status: "draft",
    current_version: 0,
    sha256,
  });
  if (error) {
    await admin.storage.from("documents").remove([path]);
    return { ok: false };
  }
  await admin.from("document_versions").insert({
    document_id: documentId,
    version: 0,
    file_path: path,
    sha256,
    created_by: userId,
    note: "Rédigé avec l'assistant",
  });
  await recordAudit({
    documentId,
    actorType: "user",
    actorId: userId,
    eventType: "document.imported",
    metadata: { kind: "assistant_draft", pages: pageCount, sha256 },
  });
  revalidatePath("/app/documents");
  return { ok: true, documentId };
}
