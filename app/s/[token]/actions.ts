"use server";

import { z } from "zod";
import { recordAudit } from "@/lib/audit";
import { sniffFileType } from "@/lib/files/sniff";
import { rateLimit } from "@/lib/rate-limit";
import { getClientIp, getUserAgent } from "@/lib/request";
import { declineSignerRequest, loadSignerContext, submitSignerSignature, type SubmitError } from "@/lib/requests/service";
import { hashToken } from "@/lib/requests/tokens";
import { createAdminClient } from "@/lib/supabase/admin";

const MAX_PNG = 2 * 1024 * 1024;

async function limited(scope: string, token: string, max: number): Promise<boolean> {
  const ip = (await getClientIp()) ?? "unknown";
  const [byIp, byToken] = await Promise.all([
    rateLimit(`${scope}-ip`, ip, max * 10, 600),
    rateLimit(`${scope}-token`, hashToken(token), max, 600),
  ]);
  return !(byIp && byToken);
}

/** Première ouverture du lien (déclenchée par le navigateur, pas par les aperçus de liens). */
export async function markOpened(token: string): Promise<void> {
  if (await limited("sign-open", token, 30)) return;
  const ctx = await loadSignerContext(token);
  if (!ctx || ctx.state !== "ready" || ctx.signer.opened_at) return;
  const admin = createAdminClient();
  const { data } = await admin
    .from("request_signers")
    .update({ opened_at: new Date().toISOString(), status: "opened" })
    .eq("id", ctx.signer.id)
    .is("opened_at", null)
    .select("id")
    .maybeSingle();
  if (data) {
    await recordAudit({
      documentId: ctx.request.document_id,
      requestId: ctx.request.id,
      actorType: "signer",
      actorId: ctx.signer.id,
      actorLabel: ctx.signer.name,
      eventType: "signer.opened",
    });
  }
}

async function readPng(value: FormDataEntryValue | null): Promise<Uint8Array | null | "invalid"> {
  if (!(value instanceof File) || value.size === 0) return null;
  if (value.size > MAX_PNG) return "invalid";
  const bytes = new Uint8Array(await value.arrayBuffer());
  return sniffFileType(bytes.subarray(0, 16)) === "png" ? bytes : "invalid";
}

export type SignResult = { ok: true; completed: boolean } | { ok: false; error: SubmitError | "consent" | "rate_limited" };

/** Signature par le signataire : images PNG + valeurs des zones + consentement explicite. */
export async function submitSigned(formData: FormData): Promise<SignResult> {
  const token = String(formData.get("token") ?? "");
  if (await limited("sign-submit", token, 10)) return { ok: false, error: "rate_limited" };
  if (formData.get("consent") !== "true") return { ok: false, error: "consent" };
  const signature = await readPng(formData.get("signature"));
  const initials = await readPng(formData.get("initials"));
  if (signature === "invalid" || initials === "invalid") return { ok: false, error: "invalid" };
  const values = z.record(z.string().max(64), z.string().max(200)).safeParse(JSON.parse(String(formData.get("values") ?? "{}")));
  if (!values.success) return { ok: false, error: "invalid" };

  return submitSignerSignature(token, {
    signaturePng: signature,
    initialsPng: initials,
    values: values.data,
    ip: await getClientIp(),
    userAgent: await getUserAgent(),
  });
}

export async function declineSigning(token: string, reason: string): Promise<{ ok: boolean }> {
  const parsed = z.string().trim().min(3).max(500).safeParse(reason);
  if (!parsed.success || (await limited("sign-decline", token, 5))) return { ok: false };
  const ok = await declineSignerRequest(token, parsed.data, { ip: await getClientIp(), userAgent: await getUserAgent() });
  return { ok };
}
