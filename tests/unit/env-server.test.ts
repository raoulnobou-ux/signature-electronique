import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
describe("variables serveur", () => {
  it("environnement des prestataires : casse tolérée, valeur inconnue ignorée", async () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = "x".repeat(30);
    process.env.PAWAPAY_ENV = " Sandbox ";
    process.env.PADDLE_ENV = "live";
    const { serverEnv } = await import("@/lib/env.server");
    expect(serverEnv.PAWAPAY_ENV).toBe("sandbox");
    expect(serverEnv.PADDLE_ENV).toBeUndefined();
  });
});
