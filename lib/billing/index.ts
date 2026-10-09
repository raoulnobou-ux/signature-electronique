import "server-only";
import { serverEnv } from "@/lib/env.server";
import { CURRENCY_CODES, type Currency } from "@/config/currencies";
import { isCfaCountry } from "@/config/markets";
import { NotchPayProvider } from "./providers/african/notchpay";
import type { PaymentMethod, PaymentOption, PaymentProvider } from "./providers/types";
import { SandboxProvider } from "./providers/sandbox";

export type { PaymentOption };

/**
 * Prestataires activés : PAYMENT_PROVIDERS (ex. « notchpay ») ; vide = tous ceux dont les
 * clés sont configurées. Retirer un nom désactive le prestataire sans toucher au code.
 */
export function providerEnabled(name: string): boolean {
  const list = (serverEnv.PAYMENT_PROVIDERS ?? "")
    .split(",")
    .map((p) => p.trim().toLowerCase())
    .filter(Boolean);
  return list.length === 0 || list.includes(name);
}

let notchpay: NotchPayProvider | null | undefined;
let sandbox: SandboxProvider | null | undefined;

/** Notch Pay : Mobile Money et carte (FCFA), dès que NOTCHPAY_PUBLIC_KEY est défini. */
export function getNotchPay(): NotchPayProvider | null {
  if (notchpay === undefined) {
    notchpay =
      serverEnv.NOTCHPAY_PUBLIC_KEY && providerEnabled("notchpay")
        ? new NotchPayProvider(serverEnv.NOTCHPAY_PUBLIC_KEY, serverEnv.NOTCHPAY_WEBHOOK_SECRET)
        : null;
  }
  return notchpay;
}

/** Bac à sable local (PAYMENTS_SANDBOX=true), jamais en production Vercel. */
export function getSandboxProvider(): SandboxProvider | null {
  if (sandbox === undefined) {
    sandbox =
      serverEnv.PAYMENTS_SANDBOX === "true" && serverEnv.VERCEL_ENV !== "production"
        ? new SandboxProvider(serverEnv.SUPABASE_SERVICE_ROLE_KEY)
        : null;
  }
  return sandbox;
}

/** Prestataires réels configurés et activés, par moyen de paiement. */
function realProviders(): PaymentProvider[] {
  return [getNotchPay()].filter((p): p is NonNullable<typeof p> => p !== null);
}

/**
 * Prestataire pour un moyen de paiement et une devise : le premier prestataire réel qui
 * les accepte, sinon le bac à sable (développement), sinon null (paiement indisponible).
 */
export function getProvider(method: PaymentMethod, currency: Currency): PaymentProvider | null {
  const real = realProviders().find((p) => p.method === method && p.currencies.includes(currency));
  return real ?? getSandboxProvider();
}

/**
 * Moyen de paiement naturel d'une devise : le franc CFA se paie par Mobile Money (seul
 * moyen local disponible pour cette devise), les autres devises par carte.
 */
export function methodForCurrency(currency: Currency): PaymentMethod {
  return currency === "XAF" ? "mobile_money" : "card";
}

/** Prestataire d'un paiement dans une devise donnée (moyen de paiement naturel de la devise). */
export function getPaymentProvider(currency: Currency): PaymentProvider | null {
  return getProvider(methodForCurrency(currency), currency);
}

/**
 * Moyens de paiement proposés à un client selon son pays (code ISO alpha-2, ou null si
 * inconnu) : la carte partout où le prestataire l'accepte ; le Mobile Money dans les pays
 * de la zone franc CFA. Pays inconnu : tous les moyens configurés.
 */
export function paymentOptions(country: string | null): PaymentOption[] {
  const sandbox = getSandboxProvider();
  const options: PaymentOption[] = [];
  for (const method of ["card", "mobile_money"] as const) {
    const real = realProviders().filter(
      (p) => p.method === method && (!country || (p.supportsCountry?.(country) ?? true)),
    );
    const currencies = [...new Set(real.flatMap((p) => [...p.currencies]))];
    if (currencies.length) {
      options.push({ method, currencies, testMode: testModes()[currencies[0]!] });
    } else if (sandbox && (method === "card" || !country || isCfaCountry(country))) {
      options.push({
        method,
        currencies: method === "card" ? ["EUR", "USD", "GBP"] : ["XAF"],
        testMode: true,
      });
    }
  }
  return options;
}

/**
 * Pays proposés pour le Mobile Money quand le client doit en choisir un (bac à sable
 * uniquement) ; vide = la page du prestataire propose elle-même les moyens disponibles.
 */
export async function mobileMoneyCountries(): Promise<string[]> {
  if (getNotchPay()) return [];
  return getSandboxProvider() ? ["CMR", "GAB", "COG", "CIV", "SEN"] : [];
}

/** Paiements de test (aucun argent réel) : bac à sable du prestataire de chaque devise. */
export function testModes(): Record<Currency, boolean> {
  const sandbox = getSandboxProvider() !== null;
  const notch = getNotchPay();
  const mobile = notch ? notch.testMode : sandbox;
  return Object.fromEntries(
    CURRENCY_CODES.map((c) => [c, methodForCurrency(c) === "mobile_money" ? mobile : sandbox]),
  ) as Record<Currency, boolean>;
}

/** Prestataire qui a créé un paiement (payments.provider), pour le revérifier. */
export function providerByName(name: string): PaymentProvider | null {
  if (name === "notchpay") return getNotchPay();
  if (name === "sandbox") return getSandboxProvider();
  return null;
}
