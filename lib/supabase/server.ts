import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { publicEnv } from "@/lib/env";
import { hardenCookie, SESSION_COOKIE_OPTIONS } from "./cookies";
import type { Database } from "./database.types";

/**
 * Client Supabase côté serveur, au nom de l'utilisateur connecté (cookies de session).
 * Toutes ses requêtes sont soumises à la Row Level Security.
 */
export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient<Database>(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookieOptions: SESSION_COOKIE_OPTIONS,
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, hardenCookie(options));
            }
          } catch {
            // Appel depuis un Server Component : les cookies sont en lecture seule.
            // Le rafraîchissement de session est assuré par proxy.ts.
          }
        },
      },
    },
  );
}
