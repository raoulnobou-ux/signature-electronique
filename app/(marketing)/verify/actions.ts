"use server";

import { rateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/request";
import { findByHash } from "@/lib/requests/verify";

/** Vérification d'un fichier par son empreinte (calculée dans le navigateur : le fichier n'est pas envoyé). */
export async function verifyHash(sha256: string) {
  const ip = (await getClientIp()) ?? "unknown";
  if (!(await rateLimit("verify-hash", ip, 60, 600))) return { found: false as const, limited: true };
  return findByHash(sha256.toLowerCase());
}
