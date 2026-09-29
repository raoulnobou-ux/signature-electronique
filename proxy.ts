import type { NextRequest } from "next/server";
import { publicEnv } from "@/lib/env";
import { buildCsp } from "@/lib/security/csp";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  // Nonce unique par requête : Next.js l'applique automatiquement à ses scripts.
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = buildCsp(nonce, {
    supabaseUrl: publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    appUrl: publicEnv.NEXT_PUBLIC_APP_URL,
    dev: process.env.NODE_ENV === "development",
  });
  const response = await updateSession(request, {
    "x-nonce": nonce,
    "Content-Security-Policy": csp,
  });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  // Toutes les routes sauf les fichiers statiques, les images et les webhooks (appelés sans session).
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon|apple-icon|manifest.webmanifest|sw.js|api/webhooks|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2)$).*)",
  ],
};
