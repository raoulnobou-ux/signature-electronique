import { describe, expect, it } from "vitest";
import { productionChecks, summarize } from "@/lib/deploy/readiness";
import { buildEnvelope, parseDsn, scrubPath } from "@/lib/monitoring/sentry";

const complete = {
  NEXT_PUBLIC_APP_URL: "https://quicksign.app",
  NEXT_PUBLIC_SUPABASE_URL: "https://abc.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
  SUPABASE_SERVICE_ROLE_KEY: "service",
  LINK_SECRET: "x".repeat(48),
  CRON_SECRET: "y".repeat(32),
  RESEND_API_KEY: "re_123",
  GOTENBERG_URL: "https://gotenberg.fly.dev",
  GOTENBERG_TOKEN: "token",
  ANTHROPIC_API_KEY: "sk-ant",
  PAWAPAY_API_TOKEN: "pawapay-token",
  PADDLE_API_KEY: "pdl_live_apikey_x",
  PADDLE_WEBHOOK_SECRET: "pdl_ntfset_x",
  PADDLE_CLIENT_TOKEN: "live_x",
  SENTRY_DSN: "https://pub@o1.ingest.sentry.io/42",
};

describe("vérifications de mise en production", () => {
  it("configuration complète : prête, sans recommandation", () => {
    const report = summarize(productionChecks(complete));
    expect(report).toMatchObject({ ready: true, blocking: [], warnings: [] });
  });

  it("modes de test, http et secrets courts bloquent la mise en ligne", () => {
    const report = summarize(
      productionChecks({
        ...complete,
        AI_MOCK: "true",
        PAYMENTS_SANDBOX: "true",
        NEXT_PUBLIC_APP_URL: "http://quicksign.app",
        LINK_SECRET: "court",
      }),
    );
    expect(report.ready).toBe(false);
    expect(report.blocking.map((c) => c.id).sort()).toEqual([
      "app_url",
      "link_secret",
      "no_mock",
      "no_sandbox",
    ]);
  });

  it("Sentry absent : simple recommandation", () => {
    const report = summarize(productionChecks({ ...complete, SENTRY_DSN: "" }));
    expect(report.ready).toBe(true);
    expect(report.warnings.map((c) => c.id)).toEqual(["sentry"]);
  });
});

describe("rapport d'erreurs Sentry", () => {
  it("DSN → point d'envoi et clé publique", () => {
    expect(parseDsn("https://pub@o1.ingest.sentry.io/42")).toEqual({
      endpoint: "https://o1.ingest.sentry.io/api/42/envelope/",
      publicKey: "pub",
    });
    expect(parseDsn("n'importe quoi")).toBeNull();
    expect(parseDsn(undefined)).toBeNull();
  });

  it("aucun jeton ni paramètre dans les chemins envoyés", () => {
    expect(scrubPath("/s/abc.def?x=1")).toBe("/s/[jeton]");
    expect(scrubPath("/invitation/secret123")).toBe("/invitation/[jeton]");
    const { body } = buildEnvelope(new Error("boom"), {
      path: "/s/tok/document?t=1",
      method: "GET",
      route: "/s/[token]/document",
      routeType: "route",
      environment: "production",
    });
    expect(body).not.toContain("tok/");
    const event = JSON.parse(body.split("\n")[2]!);
    expect(event.exception.values[0]).toMatchObject({ type: "Error", value: "boom" });
    expect(event.request).toEqual({ url: "/s/[jeton]/document", method: "GET" });
  });
});
