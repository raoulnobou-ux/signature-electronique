import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Enregistre l'échec d'un service externe (table app_errors, serveur uniquement).
 * Ne lève jamais : la journalisation ne doit pas masquer l'erreur d'origine.
 */
export async function logAppError(
  scope: string,
  error: unknown,
  extra: { code?: string; userId?: string } = {},
): Promise<void> {
  const message = (error instanceof Error ? error.message : String(error)).slice(0, 1000);
  try {
    await createAdminClient()
      .from("app_errors")
      .insert({ scope, code: extra.code ?? null, message, user_id: extra.userId ?? null });
  } catch (logError) {
    console.error("[app_errors]", logError);
  }
}
