import { beforeEach, describe, expect, it, vi } from "vitest";

const calls: string[] = [];
const limits = new Map<string, boolean>();
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: vi.fn(async (scope: string) => {
    calls.push(scope);
    return limits.get(scope) ?? true;
  }),
}));
const logAppError = vi.fn();
vi.mock("@/lib/monitoring/app-errors", () => ({
  logAppError: (...a: unknown[]) => logAppError(...a),
}));

const { checkSignupAllowed, isDisposableEmail } = await import("@/lib/abuse");

beforeEach(() => {
  calls.length = 0;
  limits.clear();
  logAppError.mockClear();
});

describe("adresses jetables", () => {
  it("refuse les domaines jetables connus et leurs sous-domaines", () => {
    expect(isDisposableEmail("x@yopmail.com")).toBe(true);
    expect(isDisposableEmail("X@Mailinator.COM")).toBe(true);
    expect(isDisposableEmail("x@eu.guerrillamail.com")).toBe(true);
  });

  it("accepte les messageries ordinaires", () => {
    for (const email of ["a@gmail.com", "b@outlook.fr", "c@orange.cm", "d@entreprise.co.uk"]) {
      expect(isDisposableEmail(email)).toBe(false);
    }
    // Un domaine qui contient seulement le nom n'est pas confondu.
    expect(isDisposableEmail("e@notyopmail.com")).toBe(false);
  });
});

describe("inscriptions par IP : paliers progressifs", () => {
  it("sous les seuils : accepté, rien n'est noté", async () => {
    expect(await checkSignupAllowed("1.2.3.4")).toEqual({ ok: true });
    expect(calls.sort()).toEqual(["signup", "signup-burst", "signup-day", "signup-soft"]);
    expect(logAppError).not.toHaveBeenCalled();
  });

  it("au-delà du seuil de surveillance : accepté mais noté, sans l'IP en clair", async () => {
    limits.set("signup-soft", false);
    expect(await checkSignupAllowed("1.2.3.4")).toEqual({ ok: true });
    expect(logAppError).toHaveBeenCalledOnce();
    expect(JSON.stringify(logAppError.mock.calls[0])).not.toContain("1.2.3.4");
  });

  it("rafale, heure puis jour : refus temporaire avec le bon délai", async () => {
    limits.set("signup-burst", false);
    expect(await checkSignupAllowed("ip")).toEqual({ ok: false, retry: "minutes" });
    limits.clear();
    limits.set("signup", false);
    expect(await checkSignupAllowed("ip")).toEqual({ ok: false, retry: "hour" });
    limits.clear();
    limits.set("signup-day", false);
    expect(await checkSignupAllowed("ip")).toEqual({ ok: false, retry: "day" });
  });
});
