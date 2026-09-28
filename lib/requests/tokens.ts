import "server-only";
import { createHash, createHmac } from "node:crypto";
import { publicEnv } from "@/lib/env";
import { serverEnv } from "@/lib/env.server";

/**
 * Liens de signature : le jeton est DÉRIVÉ (HMAC-SHA256) de l'identifiant du signataire et
 * d'un numéro de version, avec un secret serveur. On peut donc renvoyer le lien à tout moment
 * (relance, WhatsApp) sans jamais le stocker ; la base ne contient que son empreinte SHA-256.
 * Incrémenter la version révoque l'ancien lien.
 */
function secret(): string {
  return serverEnv.LINK_SECRET ?? `links:${serverEnv.SUPABASE_SERVICE_ROLE_KEY}`;
}

export function signerToken(signerId: string, version: number): string {
  return createHmac("sha256", secret()).update(`signer:${signerId}:${version}`).digest("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function signerLink(signerId: string, version: number): string {
  return `${publicEnv.NEXT_PUBLIC_APP_URL}/s/${signerToken(signerId, version)}`;
}

/** Forme valide d'un jeton (43 caractères base64url) : évite toute requête inutile. */
export const isTokenShape = (token: string) => /^[A-Za-z0-9_-]{43}$/.test(token);
