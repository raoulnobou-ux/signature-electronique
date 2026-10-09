import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
describe("variables serveur", () => {
  it("valeurs collées : espaces, guillemets et « Bearer » retirés ; nom mal orthographié accepté", async () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = "x".repeat(30);
    delete process.env.ANTHROPIC_API_KEY;
    process.env.ANTROPIC_API_KEY = " sk-ant-test ";
    process.env.NOTCHPAY_PUBLIC_KEY = ' "Bearer pk_test.abc" ';
    const { serverEnv } = await import("@/lib/env.server");
    // Nom mal orthographié dans Vercel (variable secrète impossible à renommer).
    expect(serverEnv.ANTHROPIC_API_KEY).toBe("sk-ant-test");
    expect(serverEnv.NOTCHPAY_PUBLIC_KEY).toBe("pk_test.abc");
  });
});
