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

const BOTH = {
  PADDLE_API_KEY: "pdl_live_apikey_test",
  PAWAPAY_API_TOKEN: "token",
  PAWAPAY_ENV: "production",
};

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
  it("carte partout, Mobile Money en zone CFA", async () => {
    const { paymentOptions } = await registry(BOTH);
    expect(paymentOptions("CM").map((o) => o.method)).toEqual(["card", "mobile_money"]);
    expect(paymentOptions("FR").map((o) => o.method)).toEqual(["card"]);
    expect(paymentOptions("FR")[0]!.currencies).toEqual(["EUR", "USD", "GBP"]);
    expect(paymentOptions(null).map((o) => o.method)).toEqual(["card", "mobile_money"]);
  });

  it("aucune carte dans un pays où le prestataire ne vend pas", async () => {
    const { paymentOptions } = await registry(BOTH);
    expect(paymentOptions("RU")).toEqual([]);
  });

  it("PAYMENT_PROVIDERS désactive un prestataire sans toucher au code", async () => {
    const { paymentOptions, getPaymentProvider } = await registry({
      ...BOTH,
      PAYMENT_PROVIDERS: "pawapay",
    });
    expect(paymentOptions("CM").map((o) => o.method)).toEqual(["mobile_money"]);
    expect(getPaymentProvider("EUR")).toBeNull();
    expect(getPaymentProvider("XAF")?.name).toBe("pawapay");
  });

  it("chaque devise va au bon prestataire", async () => {
    const { getPaymentProvider, methodForCurrency } = await registry(BOTH);
    expect(getPaymentProvider("XAF")?.name).toBe("pawapay");
    for (const currency of ["EUR", "USD", "GBP"] as const) {
      expect(methodForCurrency(currency)).toBe("card");
      expect(getPaymentProvider(currency)?.name).toBe("paddle");
    }
  });

  it("aucun prestataire configuré : paiement indisponible", async () => {
    const { paymentOptions, getPaymentProvider } = await registry({});
    expect(paymentOptions("CM")).toEqual([]);
    expect(getPaymentProvider("USD")).toBeNull();
  });
});
