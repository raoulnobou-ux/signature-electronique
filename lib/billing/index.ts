import "server-only";
import { serverEnv } from "@/lib/env.server";
import { CURRENCY_CODES, type Currency } from "@/config/currencies";
import { isCfaCountry } from "@/config/markets";
import { NotchPayProvider, type NotchPayChannel } from "./providers/african/notchpay";
import { ChariowProvider } from "./providers/card/chariow";
import type { PaymentMethod, PaymentOption, PaymentProvider } from "./providers/types";
import { SandboxProvider } from "./providers/sandbox";

export type { PaymentOption };
export type PaymentChannel = NotchPayChannel;

/** Canaux simulés par le bac à sable local (développement, tests e2e). */
const SANDBOX_CHANNELS: NotchPayChannel[] = [
  { id: "cm.mtn", name: "MTN Mobile Money", type: "mobile" },
  { id: "cm.orange", name: "Orange Money", type: "mobile" },
  { id: "card", name: "Carte bancaire", type: "card" },
];

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
let chariow: ChariowProvider | null | undefined;
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

/**
 * Chariow : carte bancaire et moyens locaux (page Chariow), dès que la clé API et au moins un
 * produit sont configurés. Un plan dont le produit manque n'est simplement pas proposé.
 */
export function getChariow(): ChariowProvider | null {
  if (chariow === undefined) {
    const products = {
      "essential.monthly": serverEnv.CHARIOW_PRODUCT_ESSENTIAL_MONTHLY,
      "essential.yearly": serverEnv.CHARIOW_PRODUCT_ESSENTIAL_YEARLY,
      "pro.monthly": serverEnv.CHARIOW_PRODUCT_PRO_MONTHLY,
      "pro.yearly": serverEnv.CHARIOW_PRODUCT_PRO_YEARLY,
    } as const;
    chariow =
      serverEnv.CHARIOW_API_KEY &&
      Object.values(products).some(Boolean) &&
      providerEnabled("chariow")
        ? new ChariowProvider(serverEnv.CHARIOW_API_KEY, products, serverEnv.CHARIOW_PULSE_SECRET)
        : null;
  }
  return chariow;
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
  return [getNotchPay(), getChariow()].filter((p): p is NonNullable<typeof p> => p !== null);
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
      options.push({
        method,
        currencies,
        testMode: real.some((p) => "testMode" in p && p.testMode === true),
        prorata: real.some((p) => !p.fixedPrices),
        provider: real[0]!.name,
      });
    } else if (sandbox && (method === "card" || !country || isCfaCountry(country))) {
      options.push({
        method,
        currencies: method === "card" ? ["EUR", "USD", "GBP"] : ["XAF"],
        testMode: true,
        prorata: true,
        provider: sandbox.name,
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

/**
 * Canaux de paiement réellement ouverts, pour l'affichage (noms et logos des moyens) :
 * lus chez Notch Pay, jamais écrits en dur. null = inconnu (prestataire injoignable) ;
 * [] = aucun canal actif, le paiement est alors indisponible.
 */
export async function paymentChannels(): Promise<NotchPayChannel[] | null> {
  try {
    const notch = getNotchPay();
    if (notch) return await notch.listChannels();
    if (getSandboxProvider()) return SANDBOX_CHANNELS;
    return [];
  } catch {
    // Configuration serveur incomplète (développement) : affichage générique.
    return null;
  }
}

/** La carte bancaire (Chariow) est-elle proposée ? Faux si la configuration est illisible. */
export function cardPaymentsEnabled(): boolean {
  try {
    return getChariow() !== null;
  } catch {
    return false;
  }
}

/**
 * Devises dans lesquelles un client peut réellement payer aujourd'hui (prestataires
 * configurés ; toutes en bac à sable). null = configuration illisible (développement).
 */
export function payableCurrencies(): Currency[] | null {
  try {
    if (getSandboxProvider() && realProviders().length === 0) return [...CURRENCY_CODES];
    return [...new Set(realProviders().flatMap((p) => [...p.currencies]))];
  } catch {
    return null;
  }
}

/** Paiements de test (aucun argent réel) : bac à sable du prestataire de chaque devise. */
export function testModes(): Record<Currency, boolean> {
  const sandbox = getSandboxProvider() !== null;
  const notch = getNotchPay();
  const mobile = notch ? notch.testMode : sandbox;
  // Chariow n'a pas de mode test : une devise payable par carte via Chariow est réelle.
  return Object.fromEntries(
    CURRENCY_CODES.map((c) => [c, methodForCurrency(c) === "mobile_money" ? mobile : sandbox]),
  ) as Record<Currency, boolean>;
}

/** Prestataire qui a créé un paiement (payments.provider), pour le revérifier. */
export function providerByName(name: string): PaymentProvider | null {
  if (name === "notchpay") return getNotchPay();
  if (name === "chariow") return getChariow();
  if (name === "sandbox") return getSandboxProvider();
  return null;
}
