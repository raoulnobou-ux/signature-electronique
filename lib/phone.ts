import {
  getCountries,
  getCountryCallingCode,
  parsePhoneNumberFromString,
  type CountryCode,
} from "libphonenumber-js/min";

export type { CountryCode };

export const DEFAULT_COUNTRY: CountryCode = "CM";

/** Pays proposés en tête de liste : Cameroun, Afrique francophone, diaspora. */
const FAVORITES: CountryCode[] = [
  "CM",
  "CI",
  "SN",
  "GA",
  "CG",
  "CD",
  "TD",
  "CF",
  "GQ",
  "BJ",
  "BF",
  "ML",
  "NE",
  "TG",
  "GN",
  "FR",
  "BE",
  "CA",
  "US",
];

/** Drapeau emoji à partir du code pays ISO (🇨🇲). */
export function flagEmoji(country: string): string {
  return String.fromCodePoint(
    ...[...country.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65),
  );
}

export type CountryOption = {
  code: CountryCode;
  name: string;
  dialCode: string;
  favorite: boolean;
};

export function countryOptions(locale = "fr"): CountryOption[] {
  const names = new Intl.DisplayNames([locale], { type: "region" });
  const all = getCountries().map((code) => ({
    code,
    name: names.of(code) ?? code,
    dialCode: `+${getCountryCallingCode(code)}`,
    favorite: FAVORITES.includes(code),
  }));
  const favorites = FAVORITES.map((code) => all.find((c) => c.code === code)).filter(
    (c): c is CountryOption => Boolean(c),
  );
  const others = all
    .filter((c) => !c.favorite)
    .sort((a, b) => a.name.localeCompare(b.name, locale));
  return [...favorites, ...others];
}

/** Normalise un numéro national ou international en E.164 (+237690123456), ou null s'il est invalide. */
export function toE164(input: string, country: CountryCode = DEFAULT_COUNTRY): string | null {
  const parsed = parsePhoneNumberFromString(input.trim(), country);
  return parsed?.isValid() ? parsed.number : null;
}

export function formatPhone(e164: string): string {
  return parsePhoneNumberFromString(e164)?.formatInternational() ?? e164;
}
