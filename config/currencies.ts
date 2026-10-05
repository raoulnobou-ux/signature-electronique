/**
 * Devises proposées par QuickSign. Pour en ajouter une :
 * 1. l'ajouter ici (décimales, montant minimal, pas d'arrondi) ;
 * 2. insérer ses prix dans la table plans_config (une ligne par plan) ;
 * 3. vérifier qu'au moins un prestataire de paiement l'accepte (lib/billing/providers).
 * Aucun taux de change n'est appliqué : chaque marché a ses propres prix.
 */
export const CURRENCIES = {
  XAF: { decimals: 0, minAmount: 100, roundingStep: 5, symbolDisplay: "symbol" },
  EUR: { decimals: 2, minAmount: 1, roundingStep: 0.01, symbolDisplay: "symbol" },
  USD: { decimals: 2, minAmount: 1, roundingStep: 0.01, symbolDisplay: "narrowSymbol" },
  GBP: { decimals: 2, minAmount: 1, roundingStep: 0.01, symbolDisplay: "narrowSymbol" },
} as const satisfies Record<
  string,
  {
    decimals: number;
    minAmount: number;
    roundingStep: number;
    symbolDisplay: "symbol" | "narrowSymbol";
  }
>;

export type Currency = keyof typeof CURRENCIES;

/** Ordre d'affichage dans les sélecteurs de devise. */
export const CURRENCY_CODES = Object.keys(CURRENCIES) as Currency[];

export function isCurrency(value: unknown): value is Currency {
  return typeof value === "string" && value in CURRENCIES;
}
