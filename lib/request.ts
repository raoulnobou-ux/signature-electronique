import "server-only";
import { headers } from "next/headers";

/** Adresse IP du client (derrière le proxy de l'hébergeur), ou null. */
export async function getClientIp(): Promise<string | null> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || h.get("x-real-ip") || null;
}

export async function getUserAgent(): Promise<string | null> {
  return (await headers()).get("user-agent");
}
