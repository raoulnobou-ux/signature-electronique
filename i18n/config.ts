export const locales = ["fr", "en"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "fr";
export const LOCALE_COOKIE = "NEXT_LOCALE";

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (locales as readonly string[]).includes(value);
}

/** Langue d'un profil (colonne `locale`), français par défaut. */
export function toLocale(value: unknown): Locale {
  return isLocale(value) ? value : defaultLocale;
}
