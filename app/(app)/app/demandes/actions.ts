"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { recordAudit } from "@/lib/audit";
import { getCurrentAccount, guard, type GuardDenial } from "@/lib/auth/account";
import { toE164 } from "@/lib/phone";
import { rateLimit } from "@/lib/rate-limit";
import { MAX_SIGNERS, requestFieldSchema, signerInputSchema } from "@/lib/requests/fields";
import { cancelRequest, inviteNextSigners, inviteSigner } from "@/lib/requests/service";
import { hashToken, signerLink, signerToken } from "@/lib/requests/tokens";
import { createAdminClient } from "@/lib/supabase/admin";

const createSchema = z.object({
  documentId: z.uuid(),
  mode: z.enum(["sequential", "parallel"]),
  message: z.string().trim().max(1000).optional(),
  expiresInDays: z.number().int().min(1).max(90),
  signers: z.array(signerInputSchema).min(1).max(MAX_SIGNERS),
  fields: z.array(requestFieldSchema).min(1).max(300),
});

export type CreateRequestError =
  | GuardDenial
  | "invalid"
  | "invalid_phone"
  | "missing_fields"
  | "not_found"
  | "already_pending"
  | "server";

/** Crée la demande, les liens personnels et les zones, puis invite le(s) premier(s) signataire(s). */
export async function createSignatureRequest(
  input: z.input<typeof createSchema>,
): Promise<
  { ok: true; requestId: string } | { ok: false; error: CreateRequestError; signer?: number }
> {
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const data = parsed.data;
  const access = await guard("multi_signers");
  if (!access.ok) return { ok: false, error: access.reason };
  const { account } = access;
  if (!(await rateLimit("request-create", account.userId, 30, 3600)))
    return { ok: false, error: "invalid" };

  // Chaque signataire doit avoir au moins une zone de signature ou de paraphe.
  for (let i = 0; i < data.signers.length; i++) {
    if (
      !data.fields.some((f) => f.signer === i && (f.type === "signature" || f.type === "initials"))
    ) {
      return { ok: false, error: "missing_fields", signer: i };
    }
  }
  if (data.fields.some((f) => f.signer >= data.signers.length))
    return { ok: false, error: "invalid" };

  const signers = [];
  for (const [index, s] of data.signers.entries()) {
    const phone = s.phone ? toE164(s.phone) : null;
    if (s.phone && !phone) return { ok: false, error: "invalid_phone", signer: index };
    signers.push({ ...s, email: s.email?.toLowerCase() ?? null, phone });
  }

  const admin = createAdminClient();
  const { data: doc } = await admin
    .from("documents")
    .select("id, owner_id, title, pdf_path, page_count, status, sha256, trashed_at")
    .eq("id", data.documentId)
    .maybeSingle();
  if (!doc || doc.owner_id !== account.userId || !doc.pdf_path || doc.trashed_at)
    return { ok: false, error: "not_found" };
  if (doc.status === "pending") return { ok: false, error: "already_pending" };
  if (data.fields.some((f) => f.page >= (doc.page_count ?? 0)))
    return { ok: false, error: "invalid" };

  const requestId = randomUUID();
  const expiresAt = new Date(Date.now() + data.expiresInDays * 86_400_000).toISOString();
  const { error: requestError } = await admin.from("signature_requests").insert({
    id: requestId,
    document_id: doc.id,
    owner_id: account.userId,
    title: doc.title,
    sender_name: account.profile.full_name || account.email,
    message: data.message || null,
    mode: data.mode,
    status: "pending",
    expires_at: expiresAt,
    original_sha256: doc.sha256,
  });
  if (requestError) {
    console.error("[demande] création", requestError);
    return { ok: false, error: "server" };
  }

  const signerRows = signers.map((s, index) => {
    const id = randomUUID();
    return {
      id,
      request_id: requestId,
      name: s.name,
      email: s.email,
      phone: s.phone,
      order_index: index,
      token_version: 1,
      token_hash: hashToken(signerToken(id, 1)),
      token_expires_at: expiresAt,
      status: "pending",
    };
  });
  const { error: signersError } = await admin.from("request_signers").insert(signerRows);
  const { error: fieldsError } = signersError
    ? { error: signersError }
    : await admin.from("placed_fields").insert(
        data.fields.map((f) => ({
          document_id: doc.id,
          request_signer_id: signerRows[f.signer]!.id,
          page: f.page,
          x_pct: f.x,
          y_pct: f.y,
          w_pct: f.w,
          h_pct: f.h,
          type: f.type,
          value: f.value ?? null,
          required: f.required,
        })),
      );
  if (signersError || fieldsError) {
    console.error("[demande] signataires ou zones", signersError ?? fieldsError);
    await admin.from("signature_requests").delete().eq("id", requestId);
    return { ok: false, error: "server" };
  }

  await admin.from("documents").update({ status: "pending" }).eq("id", doc.id);
  await recordAudit({
    documentId: doc.id,
    requestId,
    actorType: "user",
    actorId: account.userId,
    actorLabel: account.profile.full_name || account.email,
    eventType: "request.created",
    metadata: {
      mode: data.mode,
      signers: signers.length,
      fields: data.fields.length,
      expires_at: expiresAt,
    },
  });

  const { data: request } = await admin
    .from("signature_requests")
    .select("*")
    .eq("id", requestId)
    .single();
  if (request) await inviteNextSigners(admin, request);

  revalidatePath("/app/demandes");
  revalidatePath(`/app/documents/${doc.id}`);
  return { ok: true, requestId };
}

/** Signataire d'une demande appartenant à l'utilisateur connecté. */
async function ownedSigner(signerId: string) {
  if (!z.uuid().safeParse(signerId).success) return null;
  const account = await getCurrentAccount();
  if (!account) return null;
  const { data } = await createAdminClient()
    .from("request_signers")
    .select("*, signature_requests!inner(*)")
    .eq("id", signerId)
    .eq("signature_requests.owner_id", account.userId)
    .maybeSingle();
  if (!data) return null;
  const { signature_requests: request, ...signer } = data;
  return { account, signer, request };
}

export type LinkResult =
  | { ok: true; link: string; emailed: boolean; whatsapp: string | null }
  | { ok: false; error: "not_found" | "not_pending" | "too_soon" };

function whatsappUrl(
  phone: string | null,
  name: string,
  title: string,
  link: string,
): string | null {
  if (!phone) return null;
  const text = `Bonjour ${name}, merci de signer « ${title} » en ligne (sans compte, depuis votre téléphone) : ${link}`;
  return `https://wa.me/${phone.replace(/\D/g, "")}?text=${encodeURIComponent(text)}`;
}

/** Lien personnel du signataire (à copier ou envoyer par WhatsApp). */
export async function getSignerLink(signerId: string): Promise<LinkResult> {
  const owned = await ownedSigner(signerId);
  if (!owned) return { ok: false, error: "not_found" };
  if (owned.request.status !== "pending" || owned.signer.status === "signed")
    return { ok: false, error: "not_pending" };
  const link = signerLink(owned.signer.id, owned.signer.token_version);
  return {
    ok: true,
    link,
    emailed: false,
    whatsapp: whatsappUrl(
      owned.signer.phone,
      owned.signer.name,
      owned.request.title ?? "le document",
      link,
    ),
  };
}

/** Relance manuelle (e-mail si possible), au plus une fois par heure et par signataire. */
export async function remindSigner(signerId: string): Promise<LinkResult> {
  // Relance (e-mail) : réservée aux comptes actifs dont le plan inclut les demandes.
  if (!(await guard("multi_signers")).ok) return { ok: false, error: "not_found" };
  const owned = await ownedSigner(signerId);
  if (!owned) return { ok: false, error: "not_found" };
  const { signer, request, account } = owned;
  if (request.status !== "pending" || !["sent", "opened"].includes(signer.status))
    return { ok: false, error: "not_pending" };
  if (
    signer.last_reminded_at &&
    Date.now() - new Date(signer.last_reminded_at).getTime() < 3600_000
  ) {
    return { ok: false, error: "too_soon" };
  }
  const { link, emailed } = await inviteSigner(createAdminClient(), signer, request, {
    reminder: true,
    actorId: account.userId,
  });
  revalidatePath(`/app/demandes/${request.id}`);
  return {
    ok: true,
    link,
    emailed,
    whatsapp: whatsappUrl(signer.phone, signer.name, request.title ?? "le document", link),
  };
}

export async function cancelSignatureRequest(requestId: string): Promise<{ ok: boolean }> {
  if (!z.uuid().safeParse(requestId).success) return { ok: false };
  const account = await getCurrentAccount();
  if (!account) return { ok: false };
  const ok = await cancelRequest(requestId, account.userId);
  revalidatePath(`/app/demandes/${requestId}`);
  revalidatePath("/app/demandes");
  return { ok };
}

/** Liens temporaires du document final et du certificat (propriétaire). */
export async function getRequestFiles(
  requestId: string,
): Promise<{ ok: true; document: string | null; certificate: string | null } | { ok: false }> {
  if (!z.uuid().safeParse(requestId).success) return { ok: false };
  const account = await getCurrentAccount();
  if (!account) return { ok: false };
  const admin = createAdminClient();
  const { data: request } = await admin
    .from("signature_requests")
    .select("id, title, certificate_path, document_id, owner_id, status")
    .eq("id", requestId)
    .eq("owner_id", account.userId)
    .maybeSingle();
  if (!request) return { ok: false };
  const { data: doc } = await admin
    .from("documents")
    .select("pdf_path, title")
    .eq("id", request.document_id)
    .single();
  const name = (request.title ?? doc?.title ?? "document")
    .replace(/[\\/:*?"<>|]/g, "")
    .slice(0, 120);
  const [document, certificate] = await Promise.all([
    request.status === "completed" && doc?.pdf_path
      ? admin.storage
          .from("documents")
          .createSignedUrl(doc.pdf_path, 300, { download: `${name} (signé).pdf` })
      : Promise.resolve({ data: null }),
    request.certificate_path
      ? admin.storage
          .from("certificates")
          .createSignedUrl(request.certificate_path, 300, { download: `Certificat - ${name}.pdf` })
      : Promise.resolve({ data: null }),
  ]);
  return {
    ok: true,
    document: document.data?.signedUrl ?? null,
    certificate: certificate.data?.signedUrl ?? null,
  };
}
