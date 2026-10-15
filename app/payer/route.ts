import { NextResponse, type NextRequest } from "next/server";

/**
 * Lien de paiement des e-mails (rappels, échec, limite atteinte). Page publique hors de
 * /app : l'application Android ne l'intercepte pas, il s'ouvre dans le navigateur, où le
 * paiement est possible. Redirige vers le choix d'un plan (connexion demandée si besoin).
 */
export function GET(request: NextRequest) {
  return NextResponse.redirect(new URL("/app/abonnement#plans", request.nextUrl), 303);
}
