import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
describe("variables serveur", () => {
  it("environnement des prestataires : casse tolérée, valeur inconnue ignorée", async () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = "x".repeat(30);
    process.env.PAWAPAY_ENV = " Sandbox ";
    process.env.PADDLE_ENV = "live";
    delete process.env.ANTHROPIC_API_KEY;
    process.env.ANTROPIC_API_KEY = " sk-ant-test ";
    process.env.PAWAPAY_API_TOKEN = "ancien-jeton";
    process.env.PAWAPAY_API_TOKEN2 = ' "Bearer nouveau-jeton" ';
    const { serverEnv } = await import("@/lib/env.server");
    expect(serverEnv.PAWAPAY_ENV).toBe("sandbox");
    expect(serverEnv.PADDLE_ENV).toBeUndefined();
    // Nom mal orthographié dans Vercel (variable secrète impossible à renommer).
    expect(serverEnv.ANTHROPIC_API_KEY).toBe("sk-ant-test");
    // Nouveau jeton enregistré sous un second nom : il remplace l'ancien.
    expect(serverEnv.PAWAPAY_API_TOKEN).toBe("nouveau-jeton");
  });
});
