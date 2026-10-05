import type { CookieOptions } from "@supabase/ssr";
import { publicEnv } from "@/lib/env";

/**
 * Cookies de session durcis : HttpOnly (jamais lisibles par un script, même injecté),
 * Secure dès que le site est en HTTPS, SameSite=Lax (aucune action déclenchée depuis un
 * autre site). Aucun code du navigateur n'utilise la session Supabase : tout passe par
 * le serveur. Ne pas réintroduire de client Supabase côté navigateur sans revoir ce choix.
 */
export const SESSION_COOKIE_OPTIONS: CookieOptions = {
  httpOnly: true,
  secure: publicEnv.NEXT_PUBLIC_APP_URL.startsWith("https://"),
  sameSite: "lax",
  path: "/",
};

export function hardenCookie(options: CookieOptions | undefined): CookieOptions {
  return { ...options, ...SESSION_COOKIE_OPTIONS };
}
