import "server-only";
import { serverEnv } from "@/lib/env.server";
import type { Currency } from "@/lib/entitlements/plans";
import { logAppError } from "@/lib/monitoring/app-errors";
import { CFA_COUNTRIES } from "./cfa";
import { PaddleProvider } from "./paddle";
import { PAWAPAY_API, PawaPayProvider, pawapayApiUrl } from "./pawapay";
import type { PaymentProvider } from "./provider";
import { SandboxProvider } from "./sandbox";

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
    pawapay = serverEnv.PAWAPAY_API_TOKEN
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
    paddle = serverEnv.PADDLE_API_KEY
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

/**
 * Prestataire d'un paiement selon sa devise : pawaPay pour le FCFA (Mobile Money),
 * Paddle pour le dollar (carte, international) ; sinon le bac à sable s'il est actif ;
 * sinon null : l'interface indique que le paiement n'est pas encore disponible.
 */
export function getPaymentProvider(currency: Currency): PaymentProvider | null {
  const real = currency === "XAF" ? getPawaPay() : getPaddle();
  return real ?? getSandboxProvider();
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
  const pawapay = getPawaPay();
  return {
    XAF: pawapay ? pawapayBaseUrl() !== PAWAPAY_API.production : getSandboxProvider() !== null,
    USD: getPaddle() ? paddleEnvironment() === "sandbox" : getSandboxProvider() !== null,
  };
}

/** Prestataire qui a créé un paiement (payments.provider), pour le revérifier. */
export function providerByName(name: string): PaymentProvider | null {
  if (name === "pawapay") return getPawaPay();
  if (name === "paddle") return getPaddle();
  if (name === "sandbox") return getSandboxProvider();
  return null;
}
