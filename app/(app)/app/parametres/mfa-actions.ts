"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { recordAudit } from "@/lib/audit";
import { rateLimit } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";

const code = z
  .string()
  .trim()
  .regex(/^\d{6}$/);
export type MfaError = "invalid_code" | "rate_limited" | "unauthenticated" | "server";

async function current() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

/**
 * Démarre l'activation de la 2FA (application d'authentification, TOTP) : QR code et clé
 * à saisir. Les tentatives non terminées sont d'abord supprimées.
 */
export async function startTotpEnrollment(): Promise<
  { ok: true; factorId: string; qrCode: string; secret: string } | { ok: false; error: MfaError }
> {
  const { supabase, user } = await current();
  if (!user) return { ok: false, error: "unauthenticated" };
  if (!(await rateLimit("mfa-enroll", user.id, 10, 3600)))
    return { ok: false, error: "rate_limited" };
  const { data: factors } = await supabase.auth.mfa.listFactors();
  for (const factor of factors?.all ?? []) {
    if (factor.status !== "verified") await supabase.auth.mfa.unenroll({ factorId: factor.id });
  }
  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: "totp",
    friendlyName: `QuickSign ${Date.now()}`,
  });
  if (error || !data) {
    console.error("[mfa] enrôlement", error);
    return { ok: false, error: "server" };
  }
  return { ok: true, factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret };
}

/** Termine l'activation : le premier code valide confirme le facteur (session passée en aal2). */
export async function confirmTotpEnrollment(
  factorId: string,
  value: string,
): Promise<{ ok: true } | { ok: false; error: MfaError }> {
  const { supabase, user } = await current();
  if (!user) return { ok: false, error: "unauthenticated" };
  if (!code.safeParse(value).success || !z.uuid().safeParse(factorId).success)
    return { ok: false, error: "invalid_code" };
  if (!(await rateLimit("mfa-verify", user.id, 10, 600)))
    return { ok: false, error: "rate_limited" };
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: value.trim() });
  if (error) return { ok: false, error: "invalid_code" };
  await recordAudit({ actorType: "user", actorId: user.id, eventType: "security.mfa_enabled" });
  revalidatePath("/app/parametres");
  return { ok: true };
}

/** Désactive la 2FA : exige un code valide (preuve de possession de l'appareil). */
export async function disableTotp(
  value: string,
): Promise<{ ok: true } | { ok: false; error: MfaError }> {
  const { supabase, user } = await current();
  if (!user) return { ok: false, error: "unauthenticated" };
  if (!code.safeParse(value).success) return { ok: false, error: "invalid_code" };
  if (!(await rateLimit("mfa-verify", user.id, 10, 600)))
    return { ok: false, error: "rate_limited" };
  const { data: factors } = await supabase.auth.mfa.listFactors();
  const totp = factors?.totp.find((f) => f.status === "verified");
  if (!totp) return { ok: true };
  const verified = await supabase.auth.mfa.challengeAndVerify({
    factorId: totp.id,
    code: value.trim(),
  });
  if (verified.error) return { ok: false, error: "invalid_code" };
  const { error } = await supabase.auth.mfa.unenroll({ factorId: totp.id });
  if (error) {
    console.error("[mfa] désactivation", error);
    return { ok: false, error: "server" };
  }
  await supabase.auth.refreshSession();
  await recordAudit({ actorType: "user", actorId: user.id, eventType: "security.mfa_disabled" });
  revalidatePath("/app/parametres");
  return { ok: true };
}
