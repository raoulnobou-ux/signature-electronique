import "server-only";
import { createClient } from "@supabase/supabase-js";
import { headers } from "next/headers";
import {
  DEFAULT_PRICES,
  isPaidPlan,
  type BillingCycle,
  type Currency,
  type PaidPlan,
} from "@/lib/entitlements/plans";
import { publicEnv } from "@/lib/env";
import type { Database } from "@/lib/supabase/database.types";

export type PriceTable = Record<PaidPlan, Record<Currency, Record<BillingCycle, number>>>;

/**
 * Pays où l'on affiche les prix en FCFA par défaut (zone CEMAC, dont le Cameroun).
 * Les autres visiteurs voient les prix en dollars ; ils peuvent basculer à tout moment.
 */
const FCFA_COUNTRIES = new Set(["CM", "GA", "CG", "TD", "CF", "GQ"]);

/**
 * Devise par défaut : pays détecté par l'hébergeur (en-tête Vercel), sinon langue du
 * navigateur (français → FCFA, autre → USD).
 */
export async function detectCurrency(): Promise<Currency> {
  const h = await headers();
  const country = h.get("x-vercel-ip-country");
  if (country) return FCFA_COUNTRIES.has(country.toUpperCase()) ? "XAF" : "USD";
  const lang = h.get("accept-language")?.split(",")[0]?.slice(0, 2).toLowerCase();
  return !lang || lang === "fr" ? "XAF" : "USD";
}

/**
 * Prix lus dans plans_config (modifiables sans redéployer), mis en cache 5 minutes.
 * En cas d'indisponibilité de la base, on affiche les prix par défaut.
 */
export async function getPrices(): Promise<PriceTable> {
  const prices: PriceTable = structuredClone(DEFAULT_PRICES);
  try {
    const supabase = createClient<Database>(
      publicEnv.NEXT_PUBLIC_SUPABASE_URL,
      publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      {
        auth: { persistSession: false },
        global: { fetch: (input, init) => fetch(input, { ...init, next: { revalidate: 300 } }) },
      },
    );
    const { data, error } = await supabase
      .from("plans_config")
      .select("plan, currency, monthly_price, yearly_price");
    if (error) throw error;
    for (const row of data) {
      if (!isPaidPlan(row.plan) || (row.currency !== "XAF" && row.currency !== "USD")) continue;
      prices[row.plan][row.currency] = { monthly: row.monthly_price, yearly: row.yearly_price };
    }
  } catch (error) {
    console.warn("[pricing] plans_config indisponible, prix par défaut utilisés", error);
  }
  return prices;
}
