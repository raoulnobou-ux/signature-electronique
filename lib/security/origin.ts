import { publicEnv } from "@/lib/env";

/**
 * Protection CSRF des routes d'API authentifiées par cookie (en plus de SameSite=Lax) :
 * la requête doit venir du site lui-même. Les navigateurs envoient toujours « Origin »
 * sur un POST ; à défaut, « Sec-Fetch-Site » sert de repli. Les Server Actions de Next.js
 * font déjà cette vérification ; les routes d'API, non.
 */
export function isSameOriginRequest(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (origin) {
    const allowed = new Set([new URL(publicEnv.NEXT_PUBLIC_APP_URL).origin]);
    const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
    if (host) {
      const proto =
        request.headers.get("x-forwarded-proto") ?? new URL(request.url).protocol.replace(":", "");
      allowed.add(`${proto}://${host}`);
    }
    return allowed.has(origin);
  }
  const site = request.headers.get("sec-fetch-site");
  return site === null || site === "same-origin" || site === "none";
}
