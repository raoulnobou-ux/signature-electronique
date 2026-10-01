import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import { providerErrorCode } from "@/lib/ai/provider-error";

const apiError = (status: number, message: string) =>
  Anthropic.APIError.generate(status, { error: { message } }, message, new Headers());

describe("providerErrorCode", () => {
  it("distingue clé refusée, crédit épuisé et surcharge", () => {
    expect(providerErrorCode(apiError(401, "invalid x-api-key"))).toBe("provider_auth");
    expect(providerErrorCode(apiError(403, "permission"))).toBe("provider_auth");
    expect(providerErrorCode(apiError(402, "billing"))).toBe("provider_billing");
    expect(
      providerErrorCode(
        apiError(
          400,
          "This API key is not scoped to a workspace, so this request must include the anthropic-workspace-id header",
        ),
      ),
    ).toBe("provider_workspace");
    expect(
      providerErrorCode(apiError(400, "Your credit balance is too low to access the API")),
    ).toBe("provider_billing");
    expect(providerErrorCode(apiError(529, "overloaded"))).toBe("provider_unavailable");
    expect(providerErrorCode(apiError(429, "rate limited"))).toBe("provider_unavailable");
  });

  it("toute autre erreur reste générique", () => {
    expect(providerErrorCode(apiError(400, "invalid request"))).toBe("server");
    expect(providerErrorCode(new Error("boom"))).toBe("server");
  });
});
