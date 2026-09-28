"use server";

import { redirect } from "next/navigation";
import { publicEnv } from "@/lib/env";
import { rateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/request";
import { createClient } from "@/lib/supabase/server";
import {
  forgotPasswordSchema,
  resetPasswordSchema,
  safeNextPath,
  signInSchema,
  signUpSchema,
} from "@/lib/validation/auth";

type FieldErrors = Partial<Record<string, string>>;

export type ActionResult<T = undefined> =
  | ({ ok: true } & (T extends undefined ? object : { data: T }))
  | { ok: false; error: string; fieldErrors?: FieldErrors };

function fieldErrorsOf(issues: { path: PropertyKey[]; message: string }[]): FieldErrors {
  const errors: FieldErrors = {};
  for (const issue of issues) {
    const key = String(issue.path[0] ?? "form");
    errors[key] ??= issue.message;
  }
  return errors;
}

async function ipKey() {
  return (await getClientIp()) ?? "unknown";
}

/**
 * Inscription (étapes « Compte » + « Profil » envoyées ensemble).
 * Le trigger Postgres crée le profil et démarre l'essai de 6 jours ; un e-mail de
 * confirmation est envoyé (lien valable sur n'importe quel appareil).
 */
export async function signUp(input: unknown): Promise<ActionResult<{ email: string }>> {
  const parsed = signUpSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: "invalid", fieldErrors: fieldErrorsOf(parsed.error.issues) };
  const data = parsed.data;

  // Limites par IP larges : au Cameroun, beaucoup d'utilisateurs partagent une même IP
  // (NAT des opérateurs mobiles, cybercafés, bureaux). Les limites par compte restent strictes.
  if (!(await rateLimit("signup", await ipKey(), 30, 3600)))
    return { ok: false, error: "rate_limited" };

  const supabase = await createClient();
  const { data: result, error } = await supabase.auth.signUp({
    email: data.email,
    password: data.password,
    options: {
      emailRedirectTo: `${publicEnv.NEXT_PUBLIC_APP_URL}/app/bienvenue`,
      data: {
        full_name: data.fullName,
        phone: data.phone,
        account_type: data.accountType ?? null,
        org_name: data.orgName || null,
        org_sector: data.orgSector || null,
        city: data.city || null,
      },
    },
  });

  if (error) {
    if (error.code === "user_already_exists" || error.code === "email_exists")
      return { ok: false, error: "email_taken" };
    if (error.code === "weak_password")
      return { ok: false, error: "invalid", fieldErrors: { password: "passwordPolicy" } };
    if (error.status === 429) return { ok: false, error: "rate_limited" };
    console.error("[auth] inscription impossible", error);
    return { ok: false, error: "server" };
  }

  // Adresse déjà inscrite et confirmée : Supabase renvoie un utilisateur sans identité.
  if (result.user && result.user.identities?.length === 0)
    return { ok: false, error: "email_taken" };

  return { ok: true, data: { email: data.email } };
}

export async function resendConfirmation(email: string): Promise<ActionResult> {
  const parsed = forgotPasswordSchema.safeParse({ email });
  if (!parsed.success) return { ok: false, error: "invalid" };
  if (!(await rateLimit("resend-confirmation", parsed.data.email, 3, 600)))
    return { ok: false, error: "rate_limited" };

  const supabase = await createClient();
  const { error } = await supabase.auth.resend({
    type: "signup",
    email: parsed.data.email,
    options: { emailRedirectTo: `${publicEnv.NEXT_PUBLIC_APP_URL}/app/bienvenue` },
  });
  if (error && error.status === 429) return { ok: false, error: "rate_limited" };
  if (error) console.warn("[auth] renvoi de confirmation", error.message);
  return { ok: true };
}

export async function signIn(input: unknown, next?: string): Promise<ActionResult> {
  const parsed = signInSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: "invalid", fieldErrors: fieldErrorsOf(parsed.error.issues) };
  const { email, password } = parsed.data;

  const ip = await ipKey();
  const allowed =
    (await rateLimit("signin-ip", ip, 120, 600)) &&
    (await rateLimit("signin-account", email, 10, 600));
  if (!allowed) return { ok: false, error: "rate_limited" };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    if (error.code === "email_not_confirmed") return { ok: false, error: "unconfirmed" };
    if (error.code === "invalid_credentials" || error.status === 400)
      return { ok: false, error: "invalid_credentials" };
    if (error.status === 429) return { ok: false, error: "rate_limited" };
    console.error("[auth] connexion impossible", error);
    return { ok: false, error: "server" };
  }

  redirect(safeNextPath(next));
}

export async function signInWithGoogle(next?: string): Promise<ActionResult | undefined> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${publicEnv.NEXT_PUBLIC_APP_URL}/auth/callback?next=${encodeURIComponent(safeNextPath(next))}`,
      queryParams: { prompt: "select_account" },
    },
  });
  if (error || !data.url) {
    console.error("[auth] Google indisponible", error);
    return { ok: false, error: "google" };
  }
  redirect(data.url);
}

/** Toujours « envoyé » (pas de divulgation de l'existence d'un compte). */
export async function requestPasswordReset(input: unknown): Promise<ActionResult> {
  const parsed = forgotPasswordSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: "invalid", fieldErrors: fieldErrorsOf(parsed.error.issues) };

  const ip = await ipKey();
  const allowed =
    (await rateLimit("reset-ip", ip, 40, 3600)) &&
    (await rateLimit("reset-email", parsed.data.email, 3, 3600));
  if (!allowed) return { ok: false, error: "rate_limited" };

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${publicEnv.NEXT_PUBLIC_APP_URL}/reinitialiser-mot-de-passe`,
  });
  if (error && error.status !== 429) console.warn("[auth] réinitialisation", error.message);
  return { ok: true };
}

/** Nouveau mot de passe, après ouverture du lien de réinitialisation (session de récupération). */
export async function updatePassword(input: unknown): Promise<ActionResult> {
  const parsed = resetPasswordSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: "invalid", fieldErrors: fieldErrorsOf(parsed.error.issues) };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "expired" };

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    if (error.code === "same_password")
      return { ok: false, error: "invalid", fieldErrors: { password: "samePassword" } };
    if (error.code === "weak_password")
      return { ok: false, error: "invalid", fieldErrors: { password: "passwordPolicy" } };
    console.error("[auth] mise à jour du mot de passe", error);
    return { ok: false, error: "server" };
  }
  // Les autres sessions sont révoquées : seul cet appareil reste connecté.
  await supabase.auth.signOut({ scope: "others" });
  redirect("/app?mot-de-passe=modifie");
}

export async function signOut(scope: "local" | "global" = "local") {
  const supabase = await createClient();
  await supabase.auth.signOut({ scope });
  redirect("/connexion?deconnecte=1");
}
