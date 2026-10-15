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
  it("devises affichées : seulement celles qu'un prestataire peut encaisser", async () => {
    // Notch Pay seul : FCFA uniquement (les prix en euro, dollar et livre restent configurés).
    expect((await registry(NOTCHPAY)).payableCurrencies()).toEqual(["XAF"]);
    // Aucun prestataire : rien n'est payable.
    expect((await registry({})).payableCurrencies()).toEqual([]);
    // Bac à sable local sans prestataire réel : toutes les devises, pour les tests.
    const sandbox = await registry({ PAYMENTS_SANDBOX: "true" });
    expect(sandbox.payableCurrencies()).toEqual(
      expect.arrayContaining(["XAF", "EUR", "USD", "GBP"]),
    );
  });

  it("Notch Pay : un seul moyen, en FCFA, proposé dans tous les pays", async () => {
    const { paymentOptions } = await registry(NOTCHPAY);
    for (const country of ["CM", "SN", "FR", null]) {
      expect(paymentOptions(country)).toEqual([
        {
          method: "mobile_money",
          currencies: ["XAF"],
          testMode: false,
          prorata: true,
          provider: "notchpay",
        },
      ]);
    }
  });

  it("Chariow : la carte s'ajoute au Mobile Money, sans prorata, et seulement si configuré", async () => {
    const CHARIOW = {
      CHARIOW_API_KEY: "sk_live_x",
      CHARIOW_PULSE_SECRET: "whsec_x",
      CHARIOW_PRODUCT_ESSENTIAL_MONTHLY: "prd_ess_m",
      CHARIOW_PRODUCT_PRO_MONTHLY: "prd_pro_m",
    };
    const both = await registry({ ...NOTCHPAY, ...CHARIOW });
    expect(both.paymentOptions("CM")).toEqual([
      { method: "card", currencies: ["XAF"], testMode: false, prorata: false, provider: "chariow" },
      {
        method: "mobile_money",
        currencies: ["XAF"],
        testMode: false,
        prorata: true,
        provider: "notchpay",
      },
    ]);
    expect(both.getProvider("card", "XAF")?.name).toBe("chariow");
    expect(both.getProvider("mobile_money", "XAF")?.name).toBe("notchpay");
    // Sans moyen précisé, le FCFA reste au Mobile Money (comportement d'avant).
    expect(both.getPaymentProvider("XAF")?.name).toBe("notchpay");
    expect(both.providerByName("chariow")?.name).toBe("chariow");
    expect(both.payableCurrencies()).toEqual(["XAF"]);

    // Chariow seul : la carte en FCFA est le seul moyen.
    const alone = await registry(CHARIOW);
    expect(alone.paymentOptions("FR").map((o) => o.provider)).toEqual(["chariow"]);
    // Le FCFA sans Mobile Money configuré : Chariow prend le relais.
    expect(alone.getPaymentProvider("XAF")?.name).toBe("chariow");

    // Clé sans aucun produit, ou désactivé par PAYMENT_PROVIDERS : absent.
    expect((await registry({ CHARIOW_API_KEY: "sk_live_x" })).getChariow()).toBeNull();
    expect((await registry({ ...CHARIOW, PAYMENT_PROVIDERS: "notchpay" })).getChariow()).toBeNull();
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
