import { CURRENCIES } from "@/config/currencies";
import type { Currency } from "@/lib/entitlements/plans";

/** « 5 000 FCFA », « 9 $ » (fr) ou « $9 » (en). Les espaces insécables sont conservés. */
export function formatMoney(amount: number, currency: Currency, locale = "fr"): string {
  const config = CURRENCIES[currency];
  return new Intl.NumberFormat(locale === "fr" ? "fr-FR" : "en-US", {
    style: "currency",
    currency,
    currencyDisplay: config.symbolDisplay,
    maximumFractionDigits: config.decimals,
    minimumFractionDigits: 0,
  }).format(amount);
}

/** « 28 septembre 2026 » / « 28 September 2026 », dans le fuseau de l'utilisateur. */
export function formatLongDate(date: Date, locale = "fr", timeZone = "UTC"): string {
  return new Intl.DateTimeFormat(locale === "fr" ? "fr-FR" : "en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone,
  }).format(date);
}

/** « 1,2 Mo » */
export function formatBytes(bytes: number, locale = "fr"): string {
  const units = locale === "fr" ? ["o", "Ko", "Mo", "Go"] : ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  const digits = unit === 0 || value >= 10 ? 0 : 1;
  return `${value.toLocaleString(locale === "fr" ? "fr-FR" : "en-US", { maximumFractionDigits: digits })} ${units[unit]}`;
}
