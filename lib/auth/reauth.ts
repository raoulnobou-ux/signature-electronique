import "server-only";
import { createClient, type User } from "@supabase/supabase-js";
import { publicEnv } from "@/lib/env";
import { rateLimit } from "@/lib/rate-limit";

export type ReauthResult =
  | { ok: true }
  | {
      ok: false;
      reason: "password_required" | "invalid_password" | "recent_login_required" | "rate_limited";
    };

/** Durée pendant laquelle une connexion récente vaut réauthentification (comptes Google). */
const RECENT_LOGIN_MS = 10 * 60_000;

/** Le compte a-t-il un mot de passe (sinon : connexion Google uniquement) ? */
export function hasPassword(user: Pick<User, "identities">): boolean {
  return Boolean(user.identities?.some((i) => i.provider === "email"));
}

/**
 * Réauthentification avant une action sensible (suppression du compte…) : une session
 * volée ou un ordinateur resté ouvert ne suffisent pas.
 * - compte avec mot de passe : le mot de passe est revérifié auprès de Supabase Auth
 *   (session temporaire, aussitôt fermée ; aucun cookie touché) ;
 * - compte Google : une connexion de moins de 10 minutes est exigée.
 */
export async function verifyReauthentication(
  user: Pick<User, "id" | "email" | "identities" | "last_sign_in_at">,
  password: string | undefined,
): Promise<ReauthResult> {
  if (!(await rateLimit("reauth", user.id, 5, 600))) return { ok: false, reason: "rate_limited" };
  if (hasPassword(user)) {
    if (!password || !user.email) return { ok: false, reason: "password_required" };
    const probe = createClient(
      publicEnv.NEXT_PUBLIC_SUPABASE_URL,
      publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } },
    );
    const { data, error } = await probe.auth.signInWithPassword({
      email: user.email,
      password,
    });
    if (error || data.user?.id !== user.id) return { ok: false, reason: "invalid_password" };
    await probe.auth.signOut({ scope: "local" });
    return { ok: true };
  }
  const last = user.last_sign_in_at ? new Date(user.last_sign_in_at).getTime() : 0;
  return Date.now() - last < RECENT_LOGIN_MS
    ? { ok: true }
    : { ok: false, reason: "recent_login_required" };
}
