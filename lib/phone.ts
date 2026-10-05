import {
  getCountries,
  getCountryCallingCode,
  isSupportedCountry,
  parsePhoneNumberFromString,
  type CountryCode,
} from "libphonenumber-js/min";

export type { CountryCode };

/** Pays par défaut quand le pays du visiteur est inconnu (développement local). */
export const DEFAULT_COUNTRY: CountryCode = "CM";

/** Code pays reconnu pour la numérotation (ISO 3166-1 alpha-2). */
export function isCountryCode(value: unknown): value is CountryCode {
  return typeof value === "string" && isSupportedCountry(value);
}

/** Pays proposés en tête de liste (après le pays choisi) : marchés principaux. */
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

export function countryOptions(locale = "fr", preferred?: string | null): CountryOption[] {
  const names = new Intl.DisplayNames([locale], { type: "region" });
  const all = getCountries().map((code) => ({
    code,
    name: names.of(code) ?? code,
    dialCode: `+${getCountryCallingCode(code)}`,
    favorite: FAVORITES.includes(code),
  }));
  const first = isCountryCode(preferred) && !FAVORITES.includes(preferred) ? [preferred] : [];
  const favorites = [...first, ...FAVORITES]
    .map((code) => all.find((c) => c.code === code))
    .filter((c): c is CountryOption => Boolean(c))
    .map((c) => ({ ...c, favorite: true }));
  const others = all
    .filter((c) => !c.favorite && !first.includes(c.code))
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
