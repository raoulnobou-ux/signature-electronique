import { NextResponse, type NextRequest } from "next/server";
import { applyProfileLocale } from "@/lib/i18n/server";
import { sendWelcomeOnce } from "@/lib/auth/welcome";
import { createClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/validation/auth";

/** Retour de la connexion Google (OAuth, échange du code PKCE dans le même navigateur). */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const next = safeNextPath(searchParams.get("next"));

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error && data.user) {
      await sendWelcomeOnce(data.user.id);
      await applyProfileLocale(data.user.id);
      // Compte Google : pas de formulaire d'inscription, le pays détecté complète le profil.
      const country = request.headers.get("x-vercel-ip-country")?.toUpperCase();
      if (country && /^[A-Z]{2}$/.test(country)) {
        await supabase
          .from("profiles")
          .update({ country })
          .eq("id", data.user.id)
          .is("country", null);
      }
      if (data.user.factors?.some((f) => f.status === "verified")) {
        return NextResponse.redirect(
          new URL(`/connexion/verification?next=${encodeURIComponent(next)}`, origin),
        );
      }
      return NextResponse.redirect(new URL(next, origin));
    }
  }
  return NextResponse.redirect(new URL("/connexion?erreur=lien-invalide", origin));
}
