import "server-only";
import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Limitation de débit persistée en base (fonctionne sur plusieurs instances serverless).
 * `key` est haché : aucune adresse IP ni e-mail n'est stocké en clair.
 * En cas d'erreur de la base, on laisse passer (on ne bloque pas un utilisateur légitime).
 */
export async function rateLimit(
  scope: string,
  key: string,
  max: number,
  windowSeconds: number,
): Promise<boolean> {
  const bucket = `${scope}:${createHash("sha256").update(key).digest("hex").slice(0, 32)}`;
  try {
    const { data, error } = await createAdminClient().rpc("check_rate_limit", {
      p_bucket: bucket,
      p_max: max,
      p_window: `${windowSeconds} seconds`,
    });
    if (error) throw error;
    return data === true;
  } catch (error) {
    console.error("[rate-limit] vérification impossible", error);
    return true;
  }
}
