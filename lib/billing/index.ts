import "server-only";
import { serverEnv } from "@/lib/env.server";
import { CURRENCY_CODES, type Currency } from "@/config/currencies";
import { isCfaCountry } from "@/config/markets";
import { logAppError } from "@/lib/monitoring/app-errors";
import { CFA_COUNTRIES } from "./cfa";
import { PaddleProvider } from "./providers/card/paddle";
import { PAWAPAY_API, PawaPayProvider, pawapayApiUrl } from "./providers/african/pawapay";
import type { PaymentMethod, PaymentOption, PaymentProvider } from "./providers/types";
import { SandboxProvider } from "./providers/sandbox";

export type { PaymentOption };

/**
 * Prestataires activés : PAYMENT_PROVIDERS (ex. « paddle,pawapay ») ; vide = tous ceux dont
 * les clés sont configurées. Retirer un nom désactive le prestataire sans toucher au code.
 */
export function providerEnabled(name: string): boolean {
  const list = (serverEnv.PAYMENT_PROVIDERS ?? "")
    .split(",")
    .map((p) => p.trim().toLowerCase())
    .filter(Boolean);
  return list.length === 0 || list.includes(name);
}

let pawapay: PawaPayProvider | null | undefined;
let paddle: PaddleProvider | null | undefined;
let sandbox: SandboxProvider | null | undefined;

/**
 * Adresse de l'API pawaPay : PAWAPAY_API_SANDBOX_URL (bac à sable) si elle est renseignée
 * et que PAWAPAY_ENV ne force pas la production, sinon l'adresse officielle de PAWAPAY_ENV.
 */
export function pawapayBaseUrl(): string {
  const sandboxUrl = pawapayApiUrl(serverEnv.PAWAPAY_API_SANDBOX_URL);
  if (sandboxUrl && serverEnv.PAWAPAY_ENV !== "production") return sandboxUrl;
  return PAWAPAY_API[serverEnv.PAWAPAY_ENV ?? "production"];
}

/** pawaPay : Mobile Money (FCFA), dès que PAWAPAY_API_TOKEN est défini. */
export function getPawaPay(): PawaPayProvider | null {
  if (pawapay === undefined) {
    pawapay =
      serverEnv.PAWAPAY_API_TOKEN && providerEnabled("pawapay")
        ? new PawaPayProvider(serverEnv.PAWAPAY_API_TOKEN, pawapayBaseUrl())
        : null;
  }
  return pawapay;
}

/** Environnement Paddle : explicite, sinon déduit de la clé (« …_sdbx_… » = bac à sable). */
export function paddleEnvironment(): "sandbox" | "production" {
  return (
    serverEnv.PADDLE_ENV ??
    (serverEnv.PADDLE_API_KEY?.includes("_sdbx_") ? "sandbox" : "production")
  );
}

/** Paddle : carte et paiements internationaux (dollars), dès que PADDLE_API_KEY est défini. */
export function getPaddle(): PaddleProvider | null {
  if (paddle === undefined) {
    paddle =
      serverEnv.PADDLE_API_KEY && providerEnabled("paddle")
        ? new PaddleProvider(
            serverEnv.PADDLE_API_KEY,
            paddleEnvironment(),
            serverEnv.PADDLE_WEBHOOK_SECRET,
          )
        : null;
  }
  return paddle;
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
  return [getPaddle(), getPawaPay()].filter((p): p is NonNullable<typeof p> => p !== null);
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
 * Pays proposés pour le Mobile Money : PAWAPAY_COUNTRIES (codes alpha-3 séparés par des
 * virgules) s'il est renseigné, sinon la configuration active du compte pawaPay ; le
 * Cameroun si elle est inaccessible. Bac à sable : quelques pays pour les essais.
 */
export async function mobileMoneyCountries(): Promise<string[]> {
  const configured = (serverEnv.PAWAPAY_COUNTRIES ?? "")
    .split(",")
    .map((code) => code.trim().toUpperCase())
    .filter((code) => code in CFA_COUNTRIES);
  if (configured.length) return [...new Set(configured)];
  const pawapay = getPawaPay();
  if (!pawapay) return getSandboxProvider() ? ["CMR", "GAB", "COG", "CIV", "SEN"] : [];
  try {
    const countries = await pawapay.depositCountries();
    if (countries.length) return countries;
  } catch (error) {
    await logAppError("billing.countries", error);
    if (error instanceof Error && /pawaPay 401/.test(error.message)) {
      await logAppError("billing.pawapay_token", await pawapay.diagnoseToken());
    }
  }
  return ["CMR"];
}

/** Paiements de test (aucun argent réel) : bac à sable du prestataire de chaque devise. */
export function testModes(): Record<Currency, boolean> {
  const sandbox = getSandboxProvider() !== null;
  const mobile = getPawaPay() ? pawapayBaseUrl() !== PAWAPAY_API.production : sandbox;
  const card = getPaddle() ? paddleEnvironment() === "sandbox" : sandbox;
  return Object.fromEntries(
    CURRENCY_CODES.map((c) => [c, methodForCurrency(c) === "mobile_money" ? mobile : card]),
  ) as Record<Currency, boolean>;
}

/** Prestataire qui a créé un paiement (payments.provider), pour le revérifier. */
export function providerByName(name: string): PaymentProvider | null {
  if (name === "pawapay") return getPawaPay();
  if (name === "paddle") return getPaddle();
  if (name === "sandbox") return getSandboxProvider();
  return null;
}
