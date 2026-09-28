import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { sendWelcomeOnce } from "@/lib/auth/welcome";
import { createClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/validation/auth";

const OTP_TYPES: EmailOtpType[] = [
  "signup",
  "email",
  "recovery",
  "invite",
  "magiclink",
  "email_change",
];

/**
 * Lien reçu par e-mail (confirmation d'inscription, réinitialisation, changement d'adresse).
 * On vérifie le jeton (token_hash) côté serveur : le lien fonctionne quel que soit le
 * navigateur ou l'appareil où il est ouvert (contrairement au flux PKCE).
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = safeNextPath(searchParams.get("next"));

  if (!tokenHash || !type || !OTP_TYPES.includes(type)) {
    return NextResponse.redirect(new URL("/connexion?erreur=lien-invalide", origin));
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
  if (error || !data.user) {
    return NextResponse.redirect(new URL("/connexion?erreur=lien-invalide", origin));
  }

  if (type === "signup" || type === "email") await sendWelcomeOnce(data.user.id);

  return NextResponse.redirect(new URL(next, origin));
}
