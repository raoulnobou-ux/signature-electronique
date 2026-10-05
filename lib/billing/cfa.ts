/** Zone franc CFA : utilisable côté serveur et dans le navigateur (choix du pays). */

/**
 * Pays de la zone franc CFA : code ISO alpha-3 (pawaPay) → devise et code alpha-2 (noms).
 * Le franc CFA d'Afrique centrale (XAF) et celui d'Afrique de l'Ouest (XOF) ont la même
 * valeur : un prix en FCFA se paie au même montant dans l'un ou l'autre.
 */
export const CFA_COUNTRIES: Record<
  string,
  { currency: "XAF" | "XOF"; alpha2: string; dial: string }
> = {
  CMR: { currency: "XAF", alpha2: "CM", dial: "237" },
  GAB: { currency: "XAF", alpha2: "GA", dial: "241" },
  COG: { currency: "XAF", alpha2: "CG", dial: "242" },
  TCD: { currency: "XAF", alpha2: "TD", dial: "235" },
  CAF: { currency: "XAF", alpha2: "CF", dial: "236" },
  GNQ: { currency: "XAF", alpha2: "GQ", dial: "240" },
  CIV: { currency: "XOF", alpha2: "CI", dial: "225" },
  SEN: { currency: "XOF", alpha2: "SN", dial: "221" },
  BEN: { currency: "XOF", alpha2: "BJ", dial: "229" },
  BFA: { currency: "XOF", alpha2: "BF", dial: "226" },
  TGO: { currency: "XOF", alpha2: "TG", dial: "228" },
  MLI: { currency: "XOF", alpha2: "ML", dial: "223" },
  NER: { currency: "XOF", alpha2: "NE", dial: "227" },
  GNB: { currency: "XOF", alpha2: "GW", dial: "245" },
};

/** Les deux francs CFA sont interchangeables pour vérifier un montant payé. */
export function sameCfaCurrency(a: string, b: string): boolean {
  const cfa = (c: string) => c === "XAF" || c === "XOF";
  return a === b || (cfa(a) && cfa(b));
}

/**
 * Pays présélectionné dans le choix du pays : le pays du profil (alpha-2), sinon celui de
 * l'indicatif du numéro, s'il fait partie des pays proposés, sinon le premier proposé.
 * Le numéro lui-même n'est jamais transmis : le client saisit sur la page pawaPay le
 * numéro avec lequel il paie.
 */
export function suggestedCountry(
  phone: string | null | undefined,
  countries: string[],
  profileCountry?: string | null,
): string {
  const fromProfile = countries.find((code) => CFA_COUNTRIES[code]?.alpha2 === profileCountry);
  if (fromProfile) return fromProfile;
  const digits = (phone ?? "").replace(/\D/g, "");
  const match = countries.find((code) => {
    const dial = CFA_COUNTRIES[code]?.dial;
    return dial !== undefined && digits.startsWith(dial);
  });
  return match ?? countries[0] ?? "CMR";
}
