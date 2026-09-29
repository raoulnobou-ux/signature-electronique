import { PDFDocument } from "pdf-lib";
import { describe, expect, it, vi } from "vitest";
import { escapeXml, fitFontSize, renderStampSvg } from "@/lib/images/stamp";
import { renderCertificate } from "@/lib/requests/certificate";
import { describeDevice } from "@/lib/requests/device";
import { requestFieldSchema, signerInputSchema } from "@/lib/requests/fields";
import { templateFieldSchema } from "@/lib/templates/schema";

vi.mock("@/lib/env", () => ({ publicEnv: { NEXT_PUBLIC_APP_URL: "https://quicksign.test" } }));
vi.mock("@/lib/env.server", () => ({ serverEnv: { SUPABASE_SERVICE_ROLE_KEY: "service-role-key-for-tests", LINK_SECRET: undefined } }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/email/send", () => ({ sendEmail: vi.fn() }));
vi.mock("@/lib/audit", () => ({ recordAudit: vi.fn() }));

const { hashToken, isTokenShape, signerLink, signerToken } = await import("@/lib/requests/tokens");
const { buildSignerFields, signerState } = await import("@/lib/requests/service");

describe("générateur de cachets", () => {
  it("échappe les textes saisis (aucune injection dans le SVG)", () => {
    const svg = renderStampSvg({ shape: "round", color: "blue", organization: '<script>alert("x")</script>', title: "A & B", ink: false });
    expect(svg).not.toContain("<script");
    expect(svg).toContain("&lt;SCRIPT&gt;");
    expect(svg).toContain("A &amp; B");
    expect(escapeXml(`"'<>&`)).toBe("&quot;&apos;&lt;&gt;&amp;");
  });

  it("produit les trois formes, avec liens internes uniquement", () => {
    for (const shape of ["round", "oval", "rect"] as const) {
      const svg = renderStampSvg({ shape, color: "red", organization: "Cabinet Ngono", title: "Le Directeur", city: "Douala", date: "29/09/2026", ink: true, seed: 42 });
      expect(svg.startsWith("<svg")).toBe(true);
      expect(svg).toContain("#B3261E");
      expect(svg).toContain('filter="url(#ink)"');
      expect([...svg.matchAll(/href="([^"]+)"/g)].every((m) => m[1]!.startsWith("#"))).toBe(true);
    }
    expect(renderStampSvg({ shape: "rect", color: "blue", organization: "X", ink: false })).not.toContain("filter=");
  });

  it("réduit la police des textes longs", () => {
    expect(fitFontSize("COURT", 300, 22)).toBe(22);
    expect(fitFontSize("UN NOM DE STRUCTURE VRAIMENT TRÈS TRÈS LONG ET ENCORE", 300, 22)).toBeLessThan(10);
  });
});

describe("liens de signature", () => {
  it("jeton dérivé, stable, révocable par version, non stocké", () => {
    const a = signerToken("8a7b3f1e-0000-4000-8000-000000000001", 1);
    expect(isTokenShape(a)).toBe(true);
    expect(signerToken("8a7b3f1e-0000-4000-8000-000000000001", 1)).toBe(a);
    expect(signerToken("8a7b3f1e-0000-4000-8000-000000000001", 2)).not.toBe(a);
    expect(signerToken("8a7b3f1e-0000-4000-8000-000000000002", 1)).not.toBe(a);
    expect(hashToken(a)).toMatch(/^[0-9a-f]{64}$/);
    expect(signerLink("8a7b3f1e-0000-4000-8000-000000000001", 1)).toBe(`https://quicksign.test/s/${a}`);
    expect(isTokenShape("court")).toBe(false);
    expect(isTokenShape("A".repeat(42) + "/")).toBe(false);
  });
});

describe("zones des signataires", () => {
  const rows = [
    { id: "s", page: 0, x_pct: 10, y_pct: 80, w_pct: 30, h_pct: 8, type: "signature", value: null, required: true },
    { id: "d", page: 0, x_pct: 10, y_pct: 90, w_pct: 30, h_pct: 2, type: "date", value: null, required: true },
    { id: "n", page: 0, x_pct: 50, y_pct: 90, w_pct: 30, h_pct: 2, type: "name", value: null, required: true },
    { id: "m", page: 0, x_pct: 50, y_pct: 70, w_pct: 30, h_pct: 2, type: "mention", value: "Bon pour accord", required: true },
    { id: "t", page: 1, x_pct: 5, y_pct: 5, w_pct: 30, h_pct: 2, type: "text", value: "Ville", required: true },
    { id: "c", page: 1, x_pct: 5, y_pct: 10, w_pct: 2, h_pct: 2, type: "checkbox", value: null, required: false },
  ];
  const ctx = { signerName: "Awa Ngono", signedAt: new Date("2026-09-29T10:00:00Z"), timeZone: "Africa/Douala" };

  it("complète date, nom, mention ; exige les champs obligatoires", () => {
    expect(buildSignerFields(rows, { ...ctx, values: {} }).error).toBe("missing_value");
    const { fields, error } = buildSignerFields(rows, { ...ctx, values: { t: "Douala", c: "true" } });
    expect(error).toBeNull();
    const byId = Object.fromEntries(fields.map((f) => [f.id, f]));
    expect(byId.d!.value).toBe("29 septembre 2026");
    expect(byId.n!.value).toBe("Awa Ngono");
    expect(byId.m!.value).toBe("Bon pour accord");
    expect(byId.t!.value).toBe("Douala");
    expect(byId.c!.value).toBe("true");
    expect(byId.s!.assetId).toBeTruthy();
  });

  it("n'accepte que des zones valides et des signataires joignables", () => {
    expect(requestFieldSchema.safeParse({ id: "a", signer: 0, page: 0, x: 90, y: 0, w: 20, h: 5, type: "signature" }).success).toBe(false);
    expect(requestFieldSchema.safeParse({ id: "a", signer: 0, page: 0, x: 10, y: 0, w: 20, h: 5, type: "stamp" }).success).toBe(false);
    expect(signerInputSchema.safeParse({ name: "Awa", email: "", phone: "" }).success).toBe(false);
    expect(signerInputSchema.safeParse({ name: "Awa", email: "", phone: "+237690000000" }).success).toBe(true);
    expect(templateFieldSchema.safeParse({ id: "v", signer: 0, page: 0, x: 1, y: 1, w: 10, h: 2, type: "date", variable: true }).success).toBe(false);
  });
});

describe("état d'un signataire", () => {
  const base = { id: "r", status: "pending", mode: "sequential", expires_at: new Date(Date.now() + 86_400_000).toISOString() };
  const signer = (id: string, order: number, status = "sent") => ({ id, order_index: order, status });
  it("respecte l'ordre, l'expiration et l'annulation", () => {
    const list = [signer("a", 0), signer("b", 1, "pending")];
    expect(signerState(base as never, list[0] as never, list)).toBe("ready");
    expect(signerState(base as never, list[1] as never, list)).toBe("waiting");
    expect(signerState({ ...base, mode: "parallel" } as never, list[1] as never, list)).toBe("ready");
    expect(signerState({ ...base, status: "canceled" } as never, list[0] as never, list)).toBe("canceled");
    expect(signerState({ ...base, expires_at: new Date(Date.now() - 1000).toISOString() } as never, list[0] as never, list)).toBe("expired");
    expect(signerState({ ...base, status: "completed" } as never, signer("a", 0, "signed") as never, list)).toBe("completed");
  });
});

describe("certificat de signature", () => {
  it("génère un PDF avec QR code, empreintes et signataires", async () => {
    const bytes = await renderCertificate({
      requestId: "3f1e0000-0000-4000-8000-000000000000",
      documentTitle: "Contrat de bail — Bonamoussadi",
      ownerName: "Awa Ngono",
      ownerEmail: "awa@example.cm",
      mode: "sequential",
      createdAt: new Date("2026-09-28T08:00:00Z"),
      completedAt: new Date("2026-09-29T10:00:00Z"),
      originalSha256: "a".repeat(64),
      finalSha256: "b".repeat(64),
      verifyUrl: "https://quicksign.test/verify/3f1e0000-0000-4000-8000-000000000000",
      signers: Array.from({ length: 6 }, (_, i) => ({
        name: `Signataire ${i + 1}`,
        email: `s${i}@example.cm`,
        phone: null,
        signedAt: new Date(),
        status: "signed",
        ip: "41.202.219.10",
        userAgent: "Mozilla/5.0 (Linux; Android 13) Chrome/130.0 Mobile",
        sha256Before: "c".repeat(64),
        sha256After: "d".repeat(64),
      })),
      events: [{ at: new Date(), label: "Demande créée" }],
    });
    const pdf = await PDFDocument.load(bytes, { updateMetadata: false });
    expect(pdf.getPageCount()).toBeGreaterThanOrEqual(2);
    expect(pdf.getTitle()).toContain("Contrat de bail");
    expect(pdf.getKeywords()).toContain("b".repeat(64));
  });

  it("résume l'appareil utilisé", () => {
    expect(describeDevice("Mozilla/5.0 (Linux; Android 13) AppleWebKit Chrome/130.0 Mobile Safari")).toBe("Android · Chrome");
    expect(describeDevice("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) AppleWebKit Version/17.0 Mobile/15E148 Safari/604.1")).toBe("iPhone · Safari");
    expect(describeDevice(null)).toBe("Appareil inconnu");
  });
});
