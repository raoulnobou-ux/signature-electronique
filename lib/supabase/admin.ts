import "server-only";
import { createClient } from "@supabase/supabase-js";
import { publicEnv } from "@/lib/env";
import { serverEnv } from "@/lib/env.server";
import type { Database } from "./database.types";

/**
 * Client « service » : contourne la RLS. Réservé aux opérations serveur de confiance
 * (webhooks de paiement, tâches planifiées, finalisation de signature, journal d'audit).
 * Ne jamais l'utiliser avec des identifiants fournis par le client sans vérification.
 */
export function createAdminClient() {
  return createClient<Database>(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    serverEnv.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
}
