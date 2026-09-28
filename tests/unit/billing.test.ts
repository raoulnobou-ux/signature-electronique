import { createHmac } from "node:crypto";
import { PDFDocument } from "pdf-lib";
import { describe, expect, it, vi } from "vitest";
import { FlutterwaveProvider, isAuthenticWebhook, mapStatus } from "@/lib/billing/flutterwave";
import { quoteCheckout, roundAmount, type PriceTable, type QuoteSubscription } from "@/lib/billing/quote";
import { paymentMethodLabel, renderReceipt } from "@/lib/billing/receipt";
import { SandboxProvider } from "@/lib/billing/sandbox";
import { reminderBucket } from "@/lib/billing/service";
import { DEFAULT_PRICES } from "@/lib/entitlements/plans";

vi.mock("@/lib/audit", () => ({ recordAudit: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/email/send", () => ({ sendEmail: vi.fn() }));
vi.mock("@/lib/env", () => ({ publicEnv: { NEXT_PUBLIC_APP_URL: "http://localhost:3000" } }));
vi.mock("@/lib/env.server", () => ({ serverEnv: { SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key" } }));

const DAY = 86_400_000;
const NOW = new Date("2026-09-28T10:00:00Z");
const prices: PriceTable = structuredClone(DEFAULT_PRICES);

function sub(overrides: Partial<QuoteSubscription>): QuoteSubscription {
  return {
    state: "active",
    plan: "essential",
    billingCycle: "monthly",
    currency: "XAF",
    currentPeriodStart: new Date(NOW.getTime() - 10 * DAY),
    currentPeriodEnd: new Date(NOW.getTime() + 20 * DAY),
    cancelAtPeriodEnd: false,
    ...overrides,
  };
}

describe("devis de paiement", () => {
  it("Essentiel → Pro : immédiat, au prorata des jours restants", () => {
    const q = quoteCheckout(sub({}), { plan: "pro", cycle: "monthly", currency: "XAF" }, prices, NOW);
    // (15 000 − 5 000) × 20/30 = 6 666,67 → arrondi supérieur au multiple de 5
    expect(q).toMatchObject({ kind: "upgrade", plan: "pro", amount: 6670, currency: "XAF", cycle: "monthly" });
  });

  it("le prorata garde le cycle et la devise de l'abonnement en cours", () => {
    const q = quoteCheckout(
      sub({ billingCycle: "yearly", currency: "USD", currentPeriodStart: new Date(NOW.getTime() - 365 * DAY / 2), currentPeriodEnd: new Date(NOW.getTime() + 365 * DAY / 2) }),
      { plan: "pro", cycle: "monthly", currency: "XAF" },
      prices,
      NOW,
    );
    expect(q).toMatchObject({ kind: "upgrade", cycle: "yearly", currency: "USD", amount: 85 });
  });

  it("montant minimal pour un prorata presque nul", () => {
    const q = quoteCheckout(sub({ currentPeriodEnd: new Date(NOW.getTime() + 60_000) }), { plan: "pro", cycle: "monthly", currency: "XAF" }, prices, NOW);
    expect(q.amount).toBe(100);
  });

  it("renouvellement, essai et compte expiré : plein tarif", () => {
    expect(quoteCheckout(sub({}), { plan: "essential", cycle: "yearly", currency: "XAF" }, prices, NOW)).toMatchObject({ kind: "renewal", amount: 50000 });
    expect(quoteCheckout(sub({ plan: "pro" }), { plan: "essential", cycle: "monthly", currency: "XAF" }, prices, NOW)).toMatchObject({ kind: "renewal", amount: 5000 });
    expect(quoteCheckout(sub({ state: "trial", plan: "trial" }), { plan: "pro", cycle: "monthly", currency: "USD" }, prices, NOW)).toMatchObject({ kind: "new", amount: 26 });
    expect(quoteCheckout(sub({ state: "expired" }), { plan: "pro", cycle: "monthly", currency: "XAF" }, prices, NOW)).toMatchObject({ kind: "new", amount: 15000 });
    expect(quoteCheckout(sub({ state: "grace" }), { plan: "pro", cycle: "monthly", currency: "XAF" }, prices, NOW).kind).toBe("renewal");
  });

  it("pas de prorata si l'abonnement est annulé", () => {
    expect(quoteCheckout(sub({ cancelAtPeriodEnd: true }), { plan: "pro", cycle: "monthly", currency: "XAF" }, prices, NOW).kind).toBe("renewal");
  });

  it("arrondis par devise", () => {
    expect(roundAmount(6666.67, "XAF")).toBe(6670);
    expect(roundAmount(8.501, "USD")).toBe(8.51);
  });
});

describe("rappels de renouvellement", () => {
  it("J-5, J-2 puis jour J", () => {
    const at = (days: number) => new Date(NOW.getTime() + days * DAY);
    expect(reminderBucket(at(6), NOW)).toBeNull();
    expect(reminderBucket(at(4.5), NOW)).toBe(5);
    expect(reminderBucket(at(1.5), NOW)).toBe(2);
    expect(reminderBucket(at(0.5), NOW)).toBe(0);
    expect(reminderBucket(at(-1), NOW)).toBeNull();
  });
});

describe("Flutterwave", () => {
  const body = JSON.stringify({ event: "charge.completed", data: { id: 4242, tx_ref: "QS-abc", status: "successful", amount: 5000, currency: "XAF" } });

  it("authentifie les webhooks (HMAC ou verif-hash) et rejette le reste", () => {
    const hmac = createHmac("sha256", "secret-hash").update(body).digest("base64");
    expect(isAuthenticWebhook(new Headers({ "flutterwave-signature": hmac }), body, "secret-hash")).toBe(true);
    expect(isAuthenticWebhook(new Headers({ "flutterwave-signature": hmac }), body + " ", "secret-hash")).toBe(false);
    expect(isAuthenticWebhook(new Headers({ "verif-hash": "secret-hash" }), body, "secret-hash")).toBe(true);
    expect(isAuthenticWebhook(new Headers({ "verif-hash": "autre" }), body, "secret-hash")).toBe(false);
    expect(isAuthenticWebhook(new Headers(), body, "secret-hash")).toBe(false);
  });

  it("décode un webhook authentique avec une clé d'idempotence stable", () => {
    const provider = new FlutterwaveProvider("sk", "secret-hash");
    const event = provider.parseWebhook(new Headers({ "verif-hash": "secret-hash" }), body);
    expect(event).toMatchObject({ key: "charge.completed:4242:successful", reference: "QS-abc", transactionId: "4242" });
    expect(provider.parseWebhook(new Headers({ "verif-hash": "x" }), body)).toBeNull();
    expect(new FlutterwaveProvider("sk", undefined).parseWebhook(new Headers({ "verif-hash": "" }), body)).toBeNull();
  });

  it("revérifie la transaction par l'API (par identifiant, sinon par référence)", async () => {
    const fetcher = vi.fn(async (url: string | URL | Request) => {
      const u = String(url);
      const data = { id: 4242, tx_ref: "QS-abc", amount: 5000, currency: "XAF", status: "successful", payment_type: "mobilemoneyfranco" };
      return new Response(JSON.stringify({ status: "success", data }), { status: u.includes("/transactions/") ? 200 : 404 });
    });
    const provider = new FlutterwaveProvider("sk_test", "h", fetcher as unknown as typeof fetch);
    const tx = await provider.verifyTransaction({ reference: "QS-abc", transactionId: "4242", expected: { amount: 1, currency: "XAF" } });
    expect(tx).toMatchObject({ status: "successful", amount: 5000, currency: "XAF", method: "mobilemoneyfranco", transactionId: "4242" });
    expect(String(fetcher.mock.calls[0]![0])).toBe("https://api.flutterwave.com/v3/transactions/4242/verify");
    const headers = (fetcher.mock.calls[0] as unknown as [string, RequestInit])[1].headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer sk_test");

    await provider.verifyTransaction({ reference: "QS-abc", transactionId: "sbx_forged", expected: { amount: 1, currency: "XAF" } });
    expect(String(fetcher.mock.calls[1]![0])).toContain("verify_by_reference?tx_ref=QS-abc");
  });

  it("transaction inconnue → null (paiement abandonné)", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ status: "error", message: "No transaction was found" }), { status: 400 }));
    const provider = new FlutterwaveProvider("sk", "h", fetcher as unknown as typeof fetch);
    expect(await provider.verifyTransaction({ reference: "QS-x", transactionId: null, expected: { amount: 1, currency: "XAF" } })).toBeNull();
  });

  it("crée un checkout Mobile Money + carte en FCFA", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ status: "success", data: { link: "https://checkout.flutterwave.com/v3/hosted/pay/abc" } })));
    const provider = new FlutterwaveProvider("sk", "h", fetcher as unknown as typeof fetch);
    const { url } = await provider.createCheckout({
      reference: "QS-1",
      amount: 5000,
      currency: "XAF",
      description: "Abonnement Essentiel — mensuel",
      customer: { email: "a@b.cm", name: "Awa", phone: "+237690000000" },
      redirectUrl: "https://quicksign.app/api/billing/return",
      meta: { user_id: "u" },
    });
    expect(url).toContain("flutterwave.com");
    const sent = JSON.parse((fetcher.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(sent).toMatchObject({ tx_ref: "QS-1", amount: 5000, currency: "XAF", payment_options: "mobilemoneyfranco,card", customer: { phonenumber: "+237690000000" } });
  });

  it("statuts", () => {
    expect(mapStatus("successful")).toBe("successful");
    expect(mapStatus("failed")).toBe("failed");
    expect(mapStatus("pending")).toBe("pending");
  });
});

describe("bac à sable", () => {
  it("n'accepte que des identifiants signés par le serveur", async () => {
    const sandbox = new SandboxProvider("server-secret");
    const id = sandbox.transactionId("QS-1", "successful", "mtn");
    const expected = { amount: 5000, currency: "XAF" as const };
    expect(await sandbox.verifyTransaction({ reference: "QS-1", transactionId: id, expected })).toMatchObject({ status: "successful", amount: 5000, method: "mobilemoney_mtn" });
    // Même identifiant pour une autre référence, ou signature fabriquée : refusé.
    expect(await sandbox.verifyTransaction({ reference: "QS-2", transactionId: id, expected })).toBeNull();
    expect(await sandbox.verifyTransaction({ reference: "QS-1", transactionId: id.replace("successful", "failed"), expected })).toBeNull();
    expect(await new SandboxProvider("autre").verifyTransaction({ reference: "QS-1", transactionId: id, expected })).toBeNull();
  });
});

describe("reçu PDF", () => {
  it("génère un reçu A4 numéroté", async () => {
    const bytes = await renderReceipt({
      number: "QS-2026-000042",
      paidAt: NOW,
      customer: { name: "Awa Ngono", email: "awa@example.cm", organization: "Cabinet Ngono & Associés" },
      description: "Abonnement Pro — mensuel",
      periodStart: NOW,
      periodEnd: new Date(NOW.getTime() + 30 * DAY),
      amount: 15000,
      currency: "XAF",
      method: paymentMethodLabel("mobilemoney_orange"),
      reference: "QS-0c6f",
      transactionId: "4242",
      seller: { name: "QuickSign", url: "https://quicksign.app", email: "support@quicksign.app" },
    });
    const pdf = await PDFDocument.load(bytes, { updateMetadata: false });
    expect(pdf.getPageCount()).toBe(1);
    expect(pdf.getTitle()).toBe("Reçu QS-2026-000042");
    expect(pdf.getProducer()).toBe("QuickSign");
    expect(paymentMethodLabel("card")).toBe("Carte bancaire");
  });
});
