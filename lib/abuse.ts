import "server-only";
import { createHash } from "node:crypto";
import { DISPOSABLE_EMAIL_DOMAINS } from "@/config/disposable-domains";
import { logAppError } from "@/lib/monitoring/app-errors";
import { rateLimit } from "@/lib/rate-limit";

/** Adresse d'un service de boîte jetable (domaine ou sous-domaine de la liste). */
export function isDisposableEmail(email: string): boolean {
  const domain = email.trim().toLowerCase().split("@")[1] ?? "";
  return DISPOSABLE_EMAIL_DOMAINS.some((d) => domain === d || domain.endsWith(`.${d}`));
}

/**
 * Paliers progressifs d'inscriptions par adresse IP. Les seuils sont larges : beaucoup
 * d'utilisateurs partagent une IP (opérateurs mobiles, cybercafés, entreprises, écoles).
 * - au-delà de SOFT par heure : on laisse passer, mais l'événement est noté (surveillance) ;
 * - au-delà de BURST en 10 minutes, HOURLY par heure ou DAILY par jour : refus temporaire,
 *   avec un message invitant à réessayer plus tard (jamais de blocage définitif).
 */
export const SIGNUP_LIMITS = { burst: 8, hourly: 30, daily: 100, soft: 10 } as const;

export type SignupCheck = { ok: true } | { ok: false; retry: "minutes" | "hour" | "day" };

export async function checkSignupAllowed(ip: string): Promise<SignupCheck> {
  const [burst, hourly, daily, soft] = await Promise.all([
    rateLimit("signup-burst", ip, SIGNUP_LIMITS.burst, 600),
    rateLimit("signup", ip, SIGNUP_LIMITS.hourly, 3600),
    rateLimit("signup-day", ip, SIGNUP_LIMITS.daily, 86_400),
    rateLimit("signup-soft", ip, SIGNUP_LIMITS.soft, 3600),
  ]);
  if (!soft || !burst || !hourly || !daily) {
    // Empreinte de l'IP seulement (aucune adresse en clair dans les journaux).
    const fingerprint = createHash("sha256").update(ip).digest("hex").slice(0, 12);
    await logAppError("abuse.signup_ip", `Inscriptions nombreuses depuis l'IP ${fingerprint}`, {
      code: !daily ? "daily" : !hourly ? "hourly" : !burst ? "burst" : "soft",
    });
  }
  if (!burst) return { ok: false, retry: "minutes" };
  if (!hourly) return { ok: false, retry: "hour" };
  if (!daily) return { ok: false, retry: "day" };
  return { ok: true };
}
