import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { publicEnv } from "@/lib/env";
import { hardenCookie, SESSION_COOKIE_OPTIONS } from "./cookies";

/** Chemins de l'application qui exigent une session. */
const PROTECTED_PREFIXES = ["/app"];
/** Pages d'authentification : un utilisateur connecté est renvoyé vers l'application. */
const AUTH_PAGES = ["/connexion", "/inscription", "/mot-de-passe-oublie"];
/** Saisie du code de double authentification (session aal1 d'un compte protégé). */
const MFA_PAGE = "/connexion/verification";

/**
 * Rafraîchit la session Supabase à chaque requête (cookies) et applique les redirections
 * d'accès. Suit la recommandation @supabase/ssr : ne rien exécuter entre createServerClient
 * et getClaims().
 */
export async function updateSession(
  request: NextRequest,
  extraHeaders: Record<string, string> = {},
) {
  // En-têtes transmis au rendu (nonce CSP) + cookies de session éventuellement rafraîchis.
  const forward = () => {
    const headers = new Headers(request.headers);
    for (const [key, value] of Object.entries(extraHeaders)) headers.set(key, value);
    return NextResponse.next({ request: { headers } });
  };
  let response = forward();

  const supabase = createServerClient(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookieOptions: SESSION_COOKIE_OPTIONS,
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
          response = forward();
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, hardenCookie(options));
          }
        },
      },
    },
  );

  const { data } = await supabase.auth.getClaims();
  const isSignedIn = Boolean(data?.claims?.sub);
  const { pathname, search } = request.nextUrl;

  if (!isSignedIn && PROTECTED_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    const url = request.nextUrl.clone();
    url.pathname = "/connexion";
    url.search = `?next=${encodeURIComponent(pathname + search)}`;
    return redirectWithCookies(url, response);
  }

  // Page du code de double authentification : réservée à une session ouverte.
  if (!isSignedIn && pathname === MFA_PAGE) {
    const url = request.nextUrl.clone();
    url.pathname = "/connexion";
    url.search = "";
    return redirectWithCookies(url, response);
  }

  if (isSignedIn && AUTH_PAGES.includes(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/app";
    url.search = "";
    return redirectWithCookies(url, response);
  }

  return response;
}

/** Conserve les cookies de session rafraîchis lors d'une redirection. */
function redirectWithCookies(url: URL, from: NextResponse) {
  const redirect = NextResponse.redirect(url);
  for (const cookie of from.cookies.getAll()) redirect.cookies.set(cookie);
  return redirect;
}
