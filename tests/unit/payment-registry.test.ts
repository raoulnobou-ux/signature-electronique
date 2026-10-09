import { afterEach, describe, expect, it, vi } from "vitest";
import { defaultCurrencyForCountry, isCfaCountry } from "@/config/markets";

vi.mock("@/lib/monitoring/app-errors", () => ({ logAppError: vi.fn() }));
vi.mock("@/lib/env", () => ({ publicEnv: { NEXT_PUBLIC_APP_URL: "http://localhost:3000" } }));

/** Registre chargé avec une configuration donnée (les prestataires sont mis en cache). */
async function registry(env: Record<string, string | undefined>) {
  vi.resetModules();
  vi.doMock("@/lib/env.server", () => ({
    serverEnv: { SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key", ...env },
  }));
  return import("@/lib/billing");
}

const NOTCHPAY = { NOTCHPAY_PUBLIC_KEY: "pk.live_test_value" };

afterEach(() => vi.doUnmock("@/lib/env.server"));

describe("marchés", () => {
  it("devise par défaut selon le pays", () => {
    expect(defaultCurrencyForCountry("CM")).toBe("XAF");
    expect(defaultCurrencyForCountry("SN")).toBe("XAF");
    expect(defaultCurrencyForCountry("FR")).toBe("EUR");
    expect(defaultCurrencyForCountry("GB")).toBe("GBP");
    expect(defaultCurrencyForCountry("US")).toBe("USD");
    expect(defaultCurrencyForCountry(null)).toBe("USD");
  });

  it("zone franc CFA", () => {
    expect(isCfaCountry("CM")).toBe(true);
    expect(isCfaCountry("FR")).toBe(false);
  });
});

describe("registre des moyens de paiement", () => {
  it("Notch Pay : un seul moyen, en FCFA, proposé dans tous les pays", async () => {
    const { paymentOptions } = await registry(NOTCHPAY);
    for (const country of ["CM", "SN", "FR", null]) {
      expect(paymentOptions(country)).toEqual([
        { method: "mobile_money", currencies: ["XAF"], testMode: false },
      ]);
    }
  });

  it("clé de test : mode test affiché", async () => {
    const { paymentOptions } = await registry({ NOTCHPAY_PUBLIC_KEY: "pk_test.abc" });
    expect(paymentOptions("CM")[0]!.testMode).toBe(true);
  });

  it("FCFA → Notch Pay ; aucune autre devise tant qu'aucun prestataire carte n'est ajouté", async () => {
    const { getPaymentProvider, providerByName } = await registry(NOTCHPAY);
    expect(getPaymentProvider("XAF")?.name).toBe("notchpay");
    for (const currency of ["EUR", "USD", "GBP"] as const) {
      expect(getPaymentProvider(currency)).toBeNull();
    }
    // Anciens prestataires retirés : leurs paiements ne sont plus revérifiés.
    expect(providerByName("pawapay")).toBeNull();
    expect(providerByName("paddle")).toBeNull();
  });

  it("le client ne choisit pas de pays : la page Notch Pay propose les moyens disponibles", async () => {
    const { mobileMoneyCountries } = await registry(NOTCHPAY);
    expect(await mobileMoneyCountries()).toEqual([]);
  });

  it("PAYMENT_PROVIDERS désactive un prestataire sans toucher au code", async () => {
    const { paymentOptions, getPaymentProvider } = await registry({
      ...NOTCHPAY,
      PAYMENT_PROVIDERS: "autre",
    });
    expect(paymentOptions("CM")).toEqual([]);
    expect(getPaymentProvider("XAF")).toBeNull();
  });

  it("aucun prestataire configuré : paiement indisponible", async () => {
    const { paymentOptions, getPaymentProvider } = await registry({});
    expect(paymentOptions("CM")).toEqual([]);
    expect(getPaymentProvider("USD")).toBeNull();
  });
});
