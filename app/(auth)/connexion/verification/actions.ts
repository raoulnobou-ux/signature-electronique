"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { rateLimit } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/validation/auth";

/** Deuxième étape de la connexion : code à 6 chiffres de l'application d'authentification. */
export async function verifyLoginCode(
  value: string,
  next?: string,
): Promise<{ ok: false; error: "invalid_code" | "rate_limited" | "expired" }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "expired" };
  if (
    !z
      .string()
      .trim()
      .regex(/^\d{6}$/)
      .safeParse(value).success
  )
    return { ok: false, error: "invalid_code" };
  if (!(await rateLimit("mfa-login", user.id, 8, 600))) return { ok: false, error: "rate_limited" };
  const { data: factors } = await supabase.auth.mfa.listFactors();
  const totp = factors?.totp.find((f) => f.status === "verified");
  if (!totp) redirect(safeNextPath(next));
  const { error } = await supabase.auth.mfa.challengeAndVerify({
    factorId: totp.id,
    code: value.trim(),
  });
  if (error) return { ok: false, error: "invalid_code" };
  redirect(safeNextPath(next));
}
