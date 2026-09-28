import { cookies, headers } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import { defaultLocale, isLocale, LOCALE_COOKIE, type Locale } from "./config";

// L'anglais n'est proposé automatiquement qu'une fois la traduction livrée (Phase 9).
const ENGLISH_ENABLED = false;

/** Langue : cookie (posé depuis le profil ou le sélecteur) → Accept-Language → français. */
async function resolveLocale(): Promise<Locale> {
  const cookieLocale = (await cookies()).get(LOCALE_COOKIE)?.value;
  if (isLocale(cookieLocale) && (cookieLocale === "fr" || ENGLISH_ENABLED)) return cookieLocale;

  const accept = (await headers()).get("accept-language") ?? "";
  const preferred = accept.split(",")[0]?.trim().slice(0, 2).toLowerCase();
  if (preferred === "en" && ENGLISH_ENABLED) return "en";
  return defaultLocale;
}

export default getRequestConfig(async () => {
  const locale = await resolveLocale();
  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
    timeZone: "Africa/Douala",
  };
});
