import "server-only";
import { createClient } from "@supabase/supabase-js";
import { headers } from "next/headers";
import { isCurrency } from "@/config/currencies";
import { defaultCurrencyForCountry } from "@/config/markets";
import {
  DEFAULT_LIMITS,
  DEFAULT_PRICES,
  FREE_LIMITS,
  isPaidPlan,
  type Currency,
  type PaidPlan,
  type PlanLimits,
} from "@/lib/entitlements/plans";
import { publicEnv } from "@/lib/env";
import type { Database } from "@/lib/supabase/database.types";

import type { PriceTable } from "@/lib/billing/quote";

export type { PriceTable };

/** Pays du visiteur (code ISO alpha-2) détecté par l'hébergeur, s'il est connu. */
export async function detectCountry(): Promise<string | null> {
  const country = (await headers()).get("x-vercel-ip-country");
  return country && /^[A-Za-z]{2}$/.test(country) ? country.toUpperCase() : null;
}

/**
 * Devise par défaut selon le marché du visiteur (config/markets.ts) : FCFA en zone CFA,
 * euro en zone euro, livre au Royaume-Uni, dollar ailleurs. Toujours modifiable.
 */
export async function detectCurrency(): Promise<Currency> {
  return defaultCurrencyForCountry(await detectCountry());
}

export type LimitsTable = Record<PaidPlan | "free", PlanLimits>;

function publicClient() {
  return createClient<Database>(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      auth: { persistSession: false },
      global: { fetch: (input, init) => fetch(input, { ...init, next: { revalidate: 300 } }) },
    },
  );
}

/**
 * Limites de chaque plan et de l'accès gratuit, lues dans plans_config (mêmes valeurs que
 * celles appliquées aux comptes) pour la page Tarifs. Repli : valeurs par défaut du code.
 */
export async function getPlanLimits(): Promise<LimitsTable> {
  const limits: LimitsTable = { ...DEFAULT_LIMITS, free: FREE_LIMITS };
  try {
    const { data, error } = await publicClient()
      .from("plans_config")
      .select("plan, limits")
      .eq("currency", "XAF");
    if (error) throw error;
    for (const row of data) {
      if (isPaidPlan(row.plan) || row.plan === "free")
        limits[row.plan] = { ...limits[row.plan], ...(row.limits as unknown as PlanLimits) };
    }
  } catch (error) {
    console.warn("[pricing] limites indisponibles, valeurs par défaut utilisées", error);
  }
  return limits;
}

/**
 * Prix lus dans plans_config (modifiables sans redéployer), mis en cache 5 minutes.
 * En cas d'indisponibilité de la base, on affiche les prix par défaut.
 */
export async function getPrices(): Promise<PriceTable> {
  const prices: PriceTable = structuredClone(DEFAULT_PRICES);
  try {
    const { data, error } = await publicClient()
      .from("plans_config")
      .select("plan, currency, monthly_price, yearly_price");
    if (error) throw error;
    for (const row of data) {
      if (!isPaidPlan(row.plan) || !isCurrency(row.currency)) continue;
      prices[row.plan][row.currency] = { monthly: row.monthly_price, yearly: row.yearly_price };
    }
  } catch (error) {
    console.warn("[pricing] plans_config indisponible, prix par défaut utilisés", error);
  }
  return prices;
}
