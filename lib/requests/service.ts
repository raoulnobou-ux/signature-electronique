import "server-only";
import { recordAudit } from "@/lib/audit";
import { sha256Hex } from "@/lib/crypto";
import { documentPaths } from "@/lib/documents/paths";
import { sendEmail, type EmailMessage } from "@/lib/email/send";
import {
  requestCompletedEmail,
  requestDeclinedEmail,
  requestExpiredEmail,
  requestInvitationEmail,
} from "@/lib/email/templates";
import { publicEnv } from "@/lib/env";
import { toLocale } from "@/i18n/config";
import { formatLongDate } from "@/lib/format";
import { formatSignatureDate, MENTIONS, type Field } from "@/lib/pdf/fields";
import { stampPdf } from "@/lib/pdf/stamp";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Tables } from "@/lib/supabase/database.types";
import { renderCertificate } from "./certificate";
import type { RequestFieldType } from "./fields";
import { hashToken, isTokenShape, signerLink } from "./tokens";

type Admin = ReturnType<typeof createAdminClient>;
export type RequestRow = Tables<"signature_requests">;
export type SignerRow = Tables<"request_signers">;
export type PlacedFieldRow = Tables<"placed_fields">;

const DAY = 86_400_000;
const appUrl = () => publicEnv.NEXT_PUBLIC_APP_URL;
export const verifyUrl = (requestId: string) => `${appUrl()}/verify/${requestId}`;
export const requestUrl = (requestId: string) => `${appUrl()}/app/demandes/${requestId}`;

/** Pièce jointe si le fichier est raisonnable, sinon lien (limites des messageries). */
const ATTACHMENT_LIMIT = 8 * 1024 * 1024;

// ---------------------------------------------------------------------------
// Invitations et relances
// ---------------------------------------------------------------------------

/**
 * Envoie (ou renvoie) le lien personnel d'un signataire. Sans e-mail, le lien est partagé
 * par le propriétaire (WhatsApp, copie) : le signataire est tout de même marqué « envoyé ».
 */
export async function inviteSigner(
  admin: Admin,
  signer: SignerRow,
  request: RequestRow,
  options: { reminder?: boolean; actorId?: string | null } = {},
): Promise<{ link: string; emailed: boolean }> {
  const link = signerLink(signer.id, signer.token_version);
  let emailed = false;
  if (signer.email) {
    const [{ data: doc }, { data: sender }] = await Promise.all([
      admin.from("documents").select("title").eq("id", request.document_id).single(),
      admin.from("profiles").select("locale").eq("id", request.owner_id).single(),
    ]);
    // Le signataire n'a pas de compte : l'e-mail suit la langue de l'expéditeur.
    const locale = toLocale(sender?.locale);
    const message = requestInvitationEmail({
      locale,
      signerName: signer.name,
      senderName: request.sender_name ?? (locale === "en" ? "A sender" : "Un expéditeur"),
      documentTitle: request.title ?? doc?.title ?? "Document",
      message: request.message,
      link,
      expiresAt: request.expires_at ? formatLongDate(new Date(request.expires_at), locale) : null,
      reminder: options.reminder,
    });
    const result = await sendEmail({ to: signer.email, ...message });
    emailed = result.ok;
  }
  const now = new Date().toISOString();
  await admin
    .from("request_signers")
    .update(
      options.reminder
        ? { reminder_count: signer.reminder_count + 1, last_reminded_at: now }
        : {
            status: signer.status === "pending" ? "sent" : signer.status,
            invited_at: signer.invited_at ?? now,
          },
    )
    .eq("id", signer.id);
  await recordAudit({
    documentId: request.document_id,
    requestId: request.id,
    actorType: options.actorId ? "user" : "system",
    actorId: options.actorId ?? null,
    eventType: options.reminder ? "request.reminder_sent" : "request.invitation_sent",
    metadata: {
      signer_id: signer.id,
      signer_name: signer.name,
      channel: signer.email ? "email" : "link",
      emailed,
    },
  });
  return { link, emailed };
}

/** Invite les signataires dont c'est le tour (tous en parallèle, le suivant en séquentiel). */
export async function inviteNextSigners(admin: Admin, request: RequestRow): Promise<void> {
  const { data: signers } = await admin
    .from("request_signers")
    .select("*")
    .eq("request_id", request.id)
    .order("order_index");
  if (!signers) return;
  // Parallèle : tous ceux qui n'ont pas encore reçu leur lien. Séquentiel : le premier
  // signataire qui n'a pas signé, s'il n'a pas encore été invité.
  const next = signers.find((s) => s.status !== "signed");
  const targets =
    request.mode === "parallel"
      ? signers.filter((s) => s.status === "pending")
      : next?.status === "pending"
        ? [next]
        : [];
  for (const signer of targets) await inviteSigner(admin, signer, request);
}

// ---------------------------------------------------------------------------
// Contexte du signataire (page publique)
// ---------------------------------------------------------------------------

export type SignerState =
  "ready" | "waiting" | "signed" | "completed" | "declined" | "expired" | "canceled" | "closed";

export interface SignerContext {
  signer: SignerRow;
  request: RequestRow;
  document: { id: string; title: string; pdfPath: string; pageCount: number; ownerId: string };
  fields: PlacedFieldRow[];
  signers: Pick<SignerRow, "id" | "name" | "status" | "order_index" | "signed_at">[];
  state: SignerState;
}

export function signerState(
  request: RequestRow,
  signer: SignerRow,
  signers: Pick<SignerRow, "status" | "order_index" | "id">[],
  now = new Date(),
): SignerState {
  if (request.status === "canceled") return "canceled";
  if (signer.status === "signed") return request.status === "completed" ? "completed" : "signed";
  if (signer.status === "declined") return "declined";
  if (request.status === "declined") return "closed";
  if (request.status === "expired" || signer.status === "expired") return "expired";
  if (request.expires_at && new Date(request.expires_at).getTime() <= now.getTime())
    return "expired";
  if (request.status !== "pending") return "closed";
  if (request.mode === "sequential") {
    const before = signers.filter((s) => s.order_index < signer.order_index);
    if (before.some((s) => s.status !== "signed")) return "waiting";
  }
  return "ready";
}

export async function loadSignerContext(token: string): Promise<SignerContext | null> {
  if (!isTokenShape(token)) return null;
  const admin = createAdminClient();
  const { data: signer } = await admin
    .from("request_signers")
    .select("*")
    .eq("token_hash", hashToken(token))
    .maybeSingle();
  if (!signer) return null;
  const [{ data: request }, { data: signers }, { data: fields }] = await Promise.all([
    admin.from("signature_requests").select("*").eq("id", signer.request_id).single(),
    admin
      .from("request_signers")
      .select("id, name, status, order_index, signed_at")
      .eq("request_id", signer.request_id)
      .order("order_index"),
    admin.from("placed_fields").select("*").eq("request_signer_id", signer.id).order("page"),
  ]);
  if (!request) return null;
  const { data: doc } = await admin
    .from("documents")
    .select("id, title, pdf_path, page_count, owner_id")
    .eq("id", request.document_id)
    .single();
  if (!doc?.pdf_path) return null;
  return {
    signer,
    request,
    document: {
      id: doc.id,
      title: request.title ?? doc.title,
      pdfPath: doc.pdf_path,
      pageCount: doc.page_count ?? 0,
      ownerId: doc.owner_id,
    },
    fields: fields ?? [],
    signers: signers ?? [],
    state: signerState(request, signer, signers ?? []),
  };
}

// ---------------------------------------------------------------------------
// Signature par un signataire
// ---------------------------------------------------------------------------

export interface SignerSubmission {
  signaturePng: Uint8Array | null;
  initialsPng: Uint8Array | null;
  values: Record<string, string>;
  ip: string | null;
  userAgent: string | null;
}

export type SubmitError =
  "invalid" | "not_ready" | "missing_signature" | "missing_initials" | "missing_value" | "server";

const SIGNATURE_ID = "00000000-0000-4000-8000-000000000001";
const INITIALS_ID = "00000000-0000-4000-8000-000000000002";

/** Transforme les zones d'un signataire en champs à apposer (valeurs automatiques incluses). */
export function buildSignerFields(
  rows: Pick<
    PlacedFieldRow,
    "id" | "page" | "x_pct" | "y_pct" | "w_pct" | "h_pct" | "type" | "value" | "required"
  >[],
  context: { signerName: string; values: Record<string, string>; signedAt: Date; timeZone: string },
): { fields: Field[]; error: SubmitError | null } {
  const fields: Field[] = [];
  for (const row of rows) {
    const type = row.type as RequestFieldType;
    const base = {
      id: row.id,
      page: row.page,
      x: row.x_pct,
      y: row.y_pct,
      w: row.w_pct,
      h: row.h_pct,
      rotation: 0,
      opacity: 1,
    };
    let value: string | null = null;
    let assetId: string | null = null;
    switch (type) {
      case "signature":
        assetId = SIGNATURE_ID;
        break;
      case "initials":
        assetId = INITIALS_ID;
        break;
      case "date":
        value = formatSignatureDate(context.signedAt, context.timeZone);
        break;
      case "name":
        value = context.signerName;
        break;
      case "mention":
        value = row.value || MENTIONS[0]!;
        break;
      case "text": {
        value = (context.values[row.id] ?? "").trim().slice(0, 200);
        if (!value) {
          if (row.required) return { fields: [], error: "missing_value" };
          continue;
        }
        break;
      }
      case "checkbox": {
        const checked = context.values[row.id] === "true";
        if (row.required && !checked) return { fields: [], error: "missing_value" };
        value = checked ? "true" : "false";
        break;
      }
    }
    fields.push({ ...base, type, value, assetId } as Field);
  }
  return { fields, error: null };
}

export async function submitSignerSignature(
  token: string,
  input: SignerSubmission,
): Promise<{ ok: true; completed: boolean } | { ok: false; error: SubmitError }> {
  const ctx = await loadSignerContext(token);
  if (!ctx) return { ok: false, error: "invalid" };
  if (ctx.state !== "ready") return { ok: false, error: "not_ready" };
  const admin = createAdminClient();
  const { signer, request, fields: rows } = ctx;

  const needsSignature = rows.some((r) => r.type === "signature");
  const needsInitials = rows.some((r) => r.type === "initials");
  if (needsSignature && !input.signaturePng) return { ok: false, error: "missing_signature" };
  if (needsInitials && !input.initialsPng) return { ok: false, error: "missing_initials" };

  const { data: owner } = await admin
    .from("profiles")
    .select("timezone")
    .eq("id", request.owner_id)
    .single();
  const signedAt = new Date();
  const built = buildSignerFields(rows, {
    signerName: signer.name,
    values: input.values,
    signedAt,
    timeZone: owner?.timezone ?? "UTC",
  });
  if (built.error) return { ok: false, error: built.error };

  const images = new Map<string, Uint8Array>();
  if (input.signaturePng) images.set(SIGNATURE_ID, input.signaturePng);
  if (input.initialsPng) images.set(INITIALS_ID, input.initialsPng);

  // Conserve l'image de signature (preuve) dans le bucket privé.
  let signaturePath: string | null = null;
  if (input.signaturePng) {
    signaturePath = `requests/${request.id}/${signer.id}-signature.png`;
    await admin.storage
      .from("signatures")
      .upload(signaturePath, input.signaturePng, { contentType: "image/png", upsert: true });
  }

  // Application sur la version courante ; en parallèle, deux signataires peuvent signer en
  // même temps : la mise à jour est conditionnelle et on réessaie sur la nouvelle version.
  let result: { version: number; before: string; after: string } | null = null;
  for (let attempt = 0; attempt < 4 && !result; attempt++) {
    const { data: doc } = await admin
      .from("documents")
      .select("id, owner_id, title, pdf_path, current_version, size_bytes")
      .eq("id", request.document_id)
      .single();
    if (!doc?.pdf_path) return { ok: false, error: "server" };
    const { data: source } = await admin.storage.from("documents").download(doc.pdf_path);
    if (!source) return { ok: false, error: "server" };
    const sourceBytes = new Uint8Array(await source.arrayBuffer());
    let signed: Uint8Array;
    try {
      signed = await stampPdf(sourceBytes, built.fields, {
        images,
        footer: null,
        metadata: { author: signer.name, title: doc.title, signedAt },
      });
    } catch (error) {
      console.error("[demande] génération du PDF", error);
      return { ok: false, error: "server" };
    }
    const version = doc.current_version + 1;
    const path = documentPaths.version(doc.owner_id, doc.id, version);
    const { error: uploadError } = await admin.storage
      .from("documents")
      .upload(path, signed, { contentType: "application/pdf", upsert: false });
    if (uploadError) {
      // Version déjà créée par un autre signataire à l'instant : on recommence.
      continue;
    }
    const after = sha256Hex(signed);
    const { data: updated } = await admin
      .from("documents")
      .update({
        current_version: version,
        pdf_path: path,
        sha256: after,
        size_bytes: doc.size_bytes + signed.byteLength,
      })
      .eq("id", doc.id)
      .eq("current_version", doc.current_version)
      .select("id")
      .maybeSingle();
    if (!updated) {
      await admin.storage.from("documents").remove([path]);
      continue;
    }
    await admin.from("document_versions").insert({
      document_id: doc.id,
      version,
      file_path: path,
      sha256: after,
      created_by: null,
      note: `Signé par ${signer.name}`,
    });
    result = { version, before: sha256Hex(sourceBytes), after };
  }
  if (!result) return { ok: false, error: "server" };

  await admin
    .from("request_signers")
    .update({
      status: "signed",
      signed_at: signedAt.toISOString(),
      consented_at: signedAt.toISOString(),
      ip: input.ip && /^[0-9a-f:.]+$/i.test(input.ip) ? input.ip : null,
      user_agent: input.userAgent?.slice(0, 400) ?? null,
      signed_version: result.version,
      sha256_before: result.before,
      sha256_after: result.after,
      signature_path: signaturePath,
    })
    .eq("id", signer.id);
  await recordAudit({
    documentId: request.document_id,
    requestId: request.id,
    actorType: "signer",
    actorId: signer.id,
    actorLabel: signer.name,
    eventType: "signer.signed",
    metadata: {
      email: signer.email,
      phone: signer.phone,
      version: result.version,
      sha256_before: result.before,
      sha256_after: result.after,
      fields: built.fields.length,
      consent: true,
    },
  });

  const { data: all } = await admin
    .from("request_signers")
    .select("status")
    .eq("request_id", request.id);
  if (all?.every((s) => s.status === "signed")) {
    await completeRequest(request.id);
    return { ok: true, completed: true };
  }
  await inviteNextSigners(admin, request);
  return { ok: true, completed: false };
}

// ---------------------------------------------------------------------------
// Fin de la demande : certificat et envoi à tous
// ---------------------------------------------------------------------------

const EVENT_LABELS: Record<
  string,
  (meta: Record<string, unknown>, label: string | null) => string
> = {
  "request.created": (_m, l) => `Demande créée par ${l ?? "l'expéditeur"}`,
  "request.invitation_sent": (m) =>
    `Invitation envoyée à ${String(m.signer_name ?? "un signataire")} (${m.channel === "email" ? "e-mail" : "lien"})`,
  "request.reminder_sent": (m) => `Relance envoyée à ${String(m.signer_name ?? "un signataire")}`,
  "signer.opened": (_m, l) => `Document ouvert par ${l ?? "un signataire"}`,
  "signer.signed": (m, l) =>
    `Signé par ${l ?? "un signataire"} — version ${String(m.version ?? "?")}`,
  "request.completed": () => "Toutes les signatures sont réunies",
};

export async function completeRequest(requestId: string): Promise<void> {
  const admin = createAdminClient();
  const { data: request } = await admin
    .from("signature_requests")
    .select("*")
    .eq("id", requestId)
    .single();
  if (!request || request.status !== "pending") return;
  const [
    { data: signers },
    { data: doc },
    { data: owner },
    { data: events },
    { data: firstVersion },
  ] = await Promise.all([
    admin.from("request_signers").select("*").eq("request_id", requestId).order("order_index"),
    admin.from("documents").select("*").eq("id", request.document_id).single(),
    admin
      .from("profiles")
      .select("full_name, email, timezone, locale")
      .eq("id", request.owner_id)
      .single(),
    admin
      .from("audit_events")
      .select("created_at, event_type, actor_label, metadata, ip")
      .eq("request_id", requestId)
      .order("created_at"),
    admin
      .from("document_versions")
      .select("sha256")
      .eq("document_id", request.document_id)
      .order("version")
      .limit(1)
      .single(),
  ]);
  if (!doc || !signers) return;
  const completedAt = new Date();

  // Marque la demande terminée en premier (idempotence : un seul appel l'emporte).
  const { data: claimed } = await admin
    .from("signature_requests")
    .update({
      status: "completed",
      completed_at: completedAt.toISOString(),
      final_sha256: doc.sha256,
      final_version: doc.current_version,
    })
    .eq("id", requestId)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();
  if (!claimed) return;

  await admin
    .from("documents")
    .update({ status: "signed", signed_at: completedAt.toISOString() })
    .eq("id", doc.id);
  await recordAudit({
    documentId: doc.id,
    requestId,
    actorType: "system",
    eventType: "request.completed",
    metadata: {
      final_sha256: doc.sha256,
      final_version: doc.current_version,
      signers: signers.length,
    },
  });

  const certificate = await renderCertificate({
    requestId,
    documentTitle: request.title ?? doc.title,
    ownerName: owner?.full_name || request.sender_name || "",
    ownerEmail: owner?.email ?? "",
    mode: request.mode as "sequential" | "parallel",
    createdAt: new Date(request.created_at),
    completedAt,
    originalSha256: request.original_sha256 ?? firstVersion?.sha256 ?? "",
    finalSha256: doc.sha256 ?? "",
    verifyUrl: verifyUrl(requestId),
    timeZone: owner?.timezone ?? "UTC",
    signers: signers.map((s) => ({
      name: s.name,
      email: s.email,
      phone: s.phone,
      status: s.status,
      signedAt: s.signed_at ? new Date(s.signed_at) : null,
      ip: (s.ip as string | null) ?? null,
      userAgent: s.user_agent,
      sha256Before: s.sha256_before,
      sha256After: s.sha256_after,
    })),
    events: [
      ...(events ?? [])
        .filter((e) => EVENT_LABELS[e.event_type])
        .map((e) => ({
          at: new Date(e.created_at),
          label:
            EVENT_LABELS[e.event_type]!(
              (e.metadata ?? {}) as Record<string, unknown>,
              e.actor_label,
            ) + (e.ip ? ` — IP ${String(e.ip)}` : ""),
        })),
      { at: completedAt, label: "Certificat de signature émis" },
    ],
  });
  const certificatePath = `${request.owner_id}/${requestId}.pdf`;
  await admin.storage
    .from("certificates")
    .upload(certificatePath, certificate, { contentType: "application/pdf", upsert: true });
  await admin
    .from("signature_requests")
    .update({ certificate_path: certificatePath })
    .eq("id", requestId);
  await admin.rpc("increment_usage", {
    p_user_id: request.owner_id,
    p_kind: "documents_signed",
    p_amount: 1,
  });

  // Envoi du document final et du certificat à tous (e-mail).
  const { data: final } = await admin.storage.from("documents").download(doc.pdf_path!);
  const finalBytes = final ? new Uint8Array(await final.arrayBuffer()) : null;
  const safeTitle = (request.title ?? doc.title).replace(/[\\/:*?"<>|]/g, "").slice(0, 120);
  const attachments: NonNullable<EmailMessage["attachments"]> = [
    {
      filename: `Certificat - ${safeTitle}.pdf`,
      content: Buffer.from(certificate).toString("base64"),
    },
  ];
  let downloadUrl: string | null = null;
  if (finalBytes && finalBytes.byteLength <= ATTACHMENT_LIMIT) {
    attachments.unshift({
      filename: `${safeTitle} (signé).pdf`,
      content: Buffer.from(finalBytes).toString("base64"),
    });
  } else {
    const { data } = await admin.storage
      .from("documents")
      .createSignedUrl(doc.pdf_path!, 7 * 24 * 3600, { download: `${safeTitle} (signé).pdf` });
    downloadUrl = data?.signedUrl ?? null;
  }
  const recipients = [
    ...signers.filter((s) => s.email).map((s) => ({ name: s.name, email: s.email! })),
    ...(owner?.email && !signers.some((s) => s.email?.toLowerCase() === owner.email.toLowerCase())
      ? [{ name: owner.full_name, email: owner.email }]
      : []),
  ];
  for (const recipient of recipients) {
    const message = requestCompletedEmail({
      locale: toLocale(owner?.locale),
      name: recipient.name,
      documentTitle: request.title ?? doc.title,
      signerCount: signers.length,
      verifyUrl: verifyUrl(requestId),
      downloadUrl,
    });
    await sendEmail({ to: recipient.email, ...message, attachments });
  }
}

// ---------------------------------------------------------------------------
// Refus, annulation
// ---------------------------------------------------------------------------

export async function declineSignerRequest(
  token: string,
  reason: string,
  meta: { ip: string | null; userAgent: string | null },
): Promise<boolean> {
  const ctx = await loadSignerContext(token);
  if (!ctx || (ctx.state !== "ready" && ctx.state !== "waiting")) return false;
  const admin = createAdminClient();
  const { signer, request } = ctx;
  const { data: claimed } = await admin
    .from("signature_requests")
    .update({ status: "declined" })
    .eq("id", request.id)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();
  if (!claimed) return false;
  await admin
    .from("request_signers")
    .update({
      status: "declined",
      declined_reason: reason,
      ip: meta.ip && /^[0-9a-f:.]+$/i.test(meta.ip) ? meta.ip : null,
      user_agent: meta.userAgent?.slice(0, 400) ?? null,
    })
    .eq("id", signer.id);
  await admin.from("documents").update({ status: "declined" }).eq("id", request.document_id);
  await recordAudit({
    documentId: request.document_id,
    requestId: request.id,
    actorType: "signer",
    actorId: signer.id,
    actorLabel: signer.name,
    eventType: "signer.declined",
    metadata: { reason },
  });
  const { data: owner } = await admin
    .from("profiles")
    .select("full_name, email, locale")
    .eq("id", request.owner_id)
    .single();
  if (owner?.email) {
    await sendEmail({
      to: owner.email,
      ...requestDeclinedEmail({
        locale: toLocale(owner.locale),
        ownerName: owner.full_name,
        signerName: signer.name,
        documentTitle: ctx.document.title,
        reason,
        url: requestUrl(request.id),
      }),
    });
  }
  return true;
}

/** Statut du document quand la demande s'arrête sans aboutir. */
async function restoreDocumentStatus(
  admin: Admin,
  documentId: string,
  status: "draft" | "expired",
) {
  const { data: doc } = await admin
    .from("documents")
    .select("current_version, status")
    .eq("id", documentId)
    .single();
  if (doc?.status !== "pending") return;
  await admin
    .from("documents")
    .update({
      status: status === "expired" ? "expired" : doc.current_version > 0 ? "signed" : "draft",
    })
    .eq("id", documentId);
}

export async function cancelRequest(requestId: string, ownerId: string): Promise<boolean> {
  const admin = createAdminClient();
  const { data: request } = await admin
    .from("signature_requests")
    .update({ status: "canceled", canceled_at: new Date().toISOString() })
    .eq("id", requestId)
    .eq("owner_id", ownerId)
    .eq("status", "pending")
    .select("*")
    .maybeSingle();
  if (!request) return false;
  // Les liens restent lisibles (le signataire voit « demande annulée ») mais ne permettent
  // plus de signer : le statut de la demande est vérifié à chaque action.
  await restoreDocumentStatus(admin, request.document_id, "draft");
  await recordAudit({
    documentId: request.document_id,
    requestId,
    actorType: "user",
    actorId: ownerId,
    eventType: "request.canceled",
  });
  return true;
}

// ---------------------------------------------------------------------------
// Tâche quotidienne : expiration et relances automatiques
// ---------------------------------------------------------------------------

export const AUTO_REMINDER_DAYS = 3;
export const MAX_AUTO_REMINDERS = 2;

export async function runRequestsCron(
  now = new Date(),
): Promise<{ expired: number; reminded: number }> {
  const admin = createAdminClient();
  let expired = 0;
  let reminded = 0;

  const { data: overdue } = await admin
    .from("signature_requests")
    .update({ status: "expired" })
    .eq("status", "pending")
    .lte("expires_at", now.toISOString())
    .select("*");
  for (const request of overdue ?? []) {
    expired++;
    await admin
      .from("request_signers")
      .update({ status: "expired" })
      .eq("request_id", request.id)
      .in("status", ["pending", "sent", "opened"]);
    await restoreDocumentStatus(admin, request.document_id, "expired");
    await recordAudit({
      documentId: request.document_id,
      requestId: request.id,
      actorType: "system",
      eventType: "request.expired",
    });
    const { data: owner } = await admin
      .from("profiles")
      .select("full_name, email, locale")
      .eq("id", request.owner_id)
      .single();
    if (owner?.email) {
      await sendEmail({
        to: owner.email,
        ...requestExpiredEmail({
          locale: toLocale(owner.locale),
          ownerName: owner.full_name,
          documentTitle: request.title ?? "Document",
          url: requestUrl(request.id),
        }),
      });
    }
  }

  const threshold = new Date(now.getTime() - AUTO_REMINDER_DAYS * DAY).toISOString();
  const { data: stale } = await admin
    .from("request_signers")
    .select("*, signature_requests!inner(*)")
    .in("status", ["sent", "opened"])
    .not("email", "is", null)
    .lt("reminder_count", MAX_AUTO_REMINDERS)
    .lte("invited_at", threshold)
    .eq("signature_requests.status", "pending")
    .limit(200);
  for (const row of stale ?? []) {
    if (row.last_reminded_at && row.last_reminded_at > threshold) continue;
    const { signature_requests: request, ...signer } = row;
    await inviteSigner(admin, signer as SignerRow, request as RequestRow, { reminder: true });
    reminded++;
  }
  return { expired, reminded };
}
