import { existsSync } from "node:fs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

// .env.local n'est pas chargé automatiquement en mode test.
if (existsSync(".env.local")) process.loadEnvFile(".env.local");

export const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

/** Les tests d'intégration ne tournent que contre la base locale (npm run db:start). */
export const hasLocalDb = /127\.0\.0\.1|localhost/.test(url) && Boolean(serviceKey);

export const admin = () =>
  createClient<Database>(url, serviceKey, { auth: { persistSession: false } });

/**
 * Crée un utilisateur confirmé et renvoie un client connecté en son nom (soumis à la RLS).
 * Accès : « trial » (défaut, ancien essai de 6 jours encore en cours, fonctions Pro) ou
 * « free » (accès gratuit d'une inscription).
 */
export async function userClient(
  label: string,
  access: "trial" | "free" = "trial",
): Promise<{ id: string; client: SupabaseClient<Database> }> {
  const email = `${label}-${Date.now()}-${Math.floor(Math.random() * 1e5)}@example.com`;
  const password = "Integration-2026";
  const { data, error } = await admin().auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: label },
  });
  if (error || !data.user) throw error;
  if (access === "trial") {
    const now = Date.now();
    const { error: subError } = await admin()
      .from("subscriptions")
      .update({
        plan: "trial",
        status: "trialing",
        current_period_start: new Date(now).toISOString(),
        current_period_end: new Date(now + 6 * 86_400_000).toISOString(),
      })
      .eq("user_id", data.user.id);
    if (subError) throw subError;
  }
  const client = createClient<Database>(url, anonKey, { auth: { persistSession: false } });
  const { error: signInError } = await client.auth.signInWithPassword({ email, password });
  if (signInError) throw signInError;
  return { id: data.user.id, client };
}
