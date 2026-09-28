import { describe, expect, it } from "vitest";
import { meetsPasswordPolicy, passwordStrength } from "@/lib/password";
import { formatPhone, toE164 } from "@/lib/phone";

describe("mot de passe", () => {
  it("impose 8 caractères avec lettres et chiffres", () => {
    expect(meetsPasswordPolicy("abcdefgh")).toBe(false);
    expect(meetsPasswordPolicy("12345678")).toBe(false);
    expect(meetsPasswordPolicy("abc1234")).toBe(false);
    expect(meetsPasswordPolicy("douala2026")).toBe(true);
  });

  it("note la robustesse de 0 à 4", () => {
    expect(passwordStrength("")).toBe(0);
    expect(passwordStrength("azerty123")).toBe(1);
    expect(passwordStrength("abcd1234")).toBeLessThanOrEqual(1);
    expect(passwordStrength("Mangue2026")).toBeGreaterThanOrEqual(2);
    expect(passwordStrength("Ndole-Et-Plantain-2026!")).toBe(4);
  });
});

describe("téléphone", () => {
  it("accepte un mobile camerounais saisi sans indicatif", () => {
    expect(toE164("6 90 12 34 56")).toBe("+237690123456");
    expect(toE164("690123456", "CM")).toBe("+237690123456");
  });

  it("accepte un numéro international complet", () => {
    expect(toE164("+33 6 12 34 56 78")).toBe("+33612345678");
    expect(toE164("07 08 09 10 11", "CI")).toBe("+2250708091011");
  });

  it("refuse les numéros invalides", () => {
    expect(toE164("12345")).toBeNull();
    expect(toE164("")).toBeNull();
  });

  it("met en forme pour l'affichage", () => {
    expect(formatPhone("+237690123456")).toBe("+237 6 90 12 34 56");
  });
});

import { safeNextPath, signUpSchema } from "@/lib/validation/auth";

describe("inscription", () => {
  const base = {
    fullName: "Awa Nkeng",
    email: "  Awa@Cabinet.CM ",
    country: "CM",
    phone: "690 12 34 56",
    password: "Douala2026",
    acceptTerms: true as const,
  };

  it("normalise l'e-mail et le téléphone", () => {
    const parsed = signUpSchema.parse(base);
    expect(parsed.email).toBe("awa@cabinet.cm");
    expect(parsed.phone).toBe("+237690123456");
  });

  it("exige l'acceptation des CGU et un téléphone valide", () => {
    expect(signUpSchema.safeParse({ ...base, acceptTerms: false }).success).toBe(false);
    const bad = signUpSchema.safeParse({ ...base, phone: "123" });
    expect(bad.success).toBe(false);
    expect(bad.error?.issues[0]?.message).toBe("phone");
  });
});

describe("redirections", () => {
  it("n'autorise que les chemins internes", () => {
    expect(safeNextPath("/app/documents")).toBe("/app/documents");
    expect(safeNextPath("https://evil.example")).toBe("/app");
    expect(safeNextPath("//evil.example")).toBe("/app");
    expect(safeNextPath("/\\evil.example")).toBe("/app");
    expect(safeNextPath(null)).toBe("/app");
  });
});
