import "server-only";
import { createClient } from "@/lib/supabase/server";

/**
 * Identifiant de l'utilisateur connecté, lu depuis le jeton de session (vérifié).
 * Léger : sert aux pages publiques pour adapter l'en-tête (« Mon espace »).
 */
export async function getSessionUserId(): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  return data?.claims?.sub ?? null;
}
