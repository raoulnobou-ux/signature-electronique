import type { Currency } from "./currencies";

/**
 * Marchés : devise affichée par défaut selon le pays du visiteur (code ISO alpha-2).
 * Le visiteur peut toujours choisir une autre devise. Pays non listé : dollar.
 */

/** Zone franc CFA (Afrique centrale et de l'Ouest) : prix en FCFA. */
export const CFA_COUNTRIES_ALPHA2 = [
  "CM",
  "GA",
  "CG",
  "TD",
  "CF",
  "GQ", // CEMAC (XAF)
  "CI",
  "SN",
  "BJ",
  "BF",
  "TG",
  "ML",
  "NE",
  "GW", // UEMOA (XOF, même valeur)
] as const;

/** Zone euro (et pays utilisant l'euro). */
export const EURO_COUNTRIES_ALPHA2 = [
  "AT",
  "BE",
  "CY",
  "DE",
  "EE",
  "ES",
  "FI",
  "FR",
  "GR",
  "HR",
  "IE",
  "IT",
  "LT",
  "LU",
  "LV",
  "MT",
  "NL",
  "PT",
  "SI",
  "SK",
  "AD",
  "MC",
  "SM",
  "VA",
  "ME",
  "XK",
  // Départements et régions d'outre-mer
  "GP",
  "MQ",
  "GF",
  "RE",
  "YT",
  "PM",
  "BL",
  "MF",
] as const;

const DEFAULT_CURRENCY_BY_COUNTRY: Record<string, Currency> = {
  ...Object.fromEntries(CFA_COUNTRIES_ALPHA2.map((c) => [c, "XAF" as const])),
  ...Object.fromEntries(EURO_COUNTRIES_ALPHA2.map((c) => [c, "EUR" as const])),
  GB: "GBP",
  GG: "GBP",
  JE: "GBP",
  IM: "GBP",
};

export function defaultCurrencyForCountry(country: string | null | undefined): Currency {
  return (country && DEFAULT_CURRENCY_BY_COUNTRY[country.toUpperCase()]) || "USD";
}

/** Le pays fait-il partie de la zone franc CFA (paiement Mobile Money possible) ? */
export function isCfaCountry(country: string | null | undefined): boolean {
  return !!country && (CFA_COUNTRIES_ALPHA2 as readonly string[]).includes(country.toUpperCase());
}
