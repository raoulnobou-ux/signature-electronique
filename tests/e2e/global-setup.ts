import { loadEnvConfig } from "@next/env";
import { createClient } from "@supabase/supabase-js";

/**
 * Avant les tests de bout en bout sur la base locale : remet à zéro les compteurs de
 * limitation de débit (sinon les exécutions répétées depuis 127.0.0.1 seraient bloquées).
 * Ne s'exécute jamais contre une base distante.
 */
export default async function globalSetup() {
  loadEnvConfig(process.cwd());
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key || !/127\.0\.0\.1|localhost/.test(url)) return;

  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const { error } = await supabase.from("rate_limit_hits").delete().gte("id", 0);
  if (error) console.warn("[e2e] remise à zéro des limites impossible :", error.message);
}
