import { describe, expect, it } from "vitest";
import { suggestedCountry } from "@/lib/billing/cfa";
import { formatLongDate } from "@/lib/format";
import { countryOptions, isCountryCode, toE164 } from "@/lib/phone";
import { phoneOk, signUpSchema, validTimezone } from "@/lib/validation/auth";

const base = {
  fullName: "Jane Doe",
  email: "jane@example.com",
  country: "FR",
  password: "Ndole-Plantain-2026",
  acceptTerms: true as const,
};

describe("inscription internationale", () => {
  it("le téléphone est facultatif", () => {
    const parsed = signUpSchema.safeParse({ ...base, phone: "" });
    expect(parsed.success).toBe(true);
    expect(parsed.data!.phone).toBeNull();
  });

  it("un numéro donné est normalisé selon le pays choisi", () => {
    const parsed = signUpSchema.safeParse({ ...base, phone: "06 12 34 56 78" });
    expect(parsed.data!.phone).toBe("+33612345678");
    expect(signUpSchema.safeParse({ ...base, phone: "123" }).success).toBe(false);
    expect(phoneOk("", "US")).toBe(true);
    expect(phoneOk("(201) 555-0123", "US")).toBe(true);
    expect(toE164("6 90 12 34 56", "CM")).toBe("+237690123456");
  });

  it("garde le fuseau de l'appareil s'il est valide, sinon aucun (UTC en base)", () => {
    const parsed = signUpSchema.safeParse({ ...base, phone: "", timezone: "America/Toronto" });
    expect(parsed.data!.timezone).toBe("America/Toronto");
    expect(validTimezone("Mars/Olympus")).toBeNull();
    expect(validTimezone(undefined)).toBeNull();
  });
});

describe("pays", () => {
  it("le pays détecté passe en tête de liste, une seule fois", () => {
    const options = countryOptions("fr", "JP");
    expect(options[0]!.code).toBe("JP");
    expect(options.filter((o) => o.code === "JP")).toHaveLength(1);
    expect(countryOptions("fr", "CM").filter((o) => o.code === "CM")).toHaveLength(1);
    expect(isCountryCode("FR")).toBe(true);
    expect(isCountryCode("ZZ")).toBe(false);
    expect(isCountryCode(null)).toBe(false);
  });

  it("Mobile Money : le pays du profil l'emporte sur l'indicatif du numéro", () => {
    expect(suggestedCountry("+237690000000", ["CMR", "SEN"], "SN")).toBe("SEN");
    expect(suggestedCountry("+237690000000", ["CMR", "SEN"], "FR")).toBe("CMR");
    expect(suggestedCountry(null, ["CMR", "SEN"], null)).toBe("CMR");
  });
});

describe("formats de date", () => {
  const date = new Date("2026-10-05T23:30:00Z");
  it("suivent la langue et le fuseau de l'utilisateur", () => {
    expect(formatLongDate(date, "fr", "UTC")).toBe("5 octobre 2026");
    expect(formatLongDate(date, "en", "UTC")).toBe("5 October 2026");
    // 23 h 30 UTC : déjà le 6 à Tokyo, encore le 5 à Los Angeles.
    expect(formatLongDate(date, "fr", "Asia/Tokyo")).toBe("6 octobre 2026");
    expect(formatLongDate(date, "en", "America/Los_Angeles")).toBe("5 October 2026");
  });
});
