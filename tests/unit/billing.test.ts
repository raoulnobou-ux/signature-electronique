import { createHmac } from "node:crypto";
import { PDFDocument } from "pdf-lib";
import { describe, expect, it, vi } from "vitest";
import {
  NotchPayProvider,
  mapNotchPayStatus,
  verifyNotchPaySignature,
} from "@/lib/billing/providers/african/notchpay";
import { sameCfaCurrency, suggestedCountry } from "@/lib/billing/cfa";
import {
  quoteCheckout,
  roundAmount,
  type PriceTable,
  type QuoteSubscription,
} from "@/lib/billing/quote";
import { paymentMethodLabel, renderReceipt } from "@/lib/billing/receipt";
import { SandboxProvider } from "@/lib/billing/providers/sandbox";
import { paymentDescription, reminderBucket } from "@/lib/billing/service";
import { DEFAULT_PRICES } from "@/lib/entitlements/plans";

vi.mock("@/lib/audit", () => ({ recordAudit: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/email/send", () => ({ sendEmail: vi.fn() }));
vi.mock("@/lib/env", () => ({ publicEnv: { NEXT_PUBLIC_APP_URL: "http://localhost:3000" } }));
vi.mock("@/lib/env.server", () => ({
  serverEnv: { SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key" },
}));

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
    const q = quoteCheckout(
      sub({}),
      { plan: "pro", cycle: "monthly", currency: "XAF" },
      prices,
      NOW,
    );
    // (15 000 − 5 000) × 20/30 = 6 666,67 → arrondi supérieur au multiple de 5
    expect(q).toMatchObject({
      kind: "upgrade",
      plan: "pro",
      amount: 6670,
      currency: "XAF",
      cycle: "monthly",
    });
  });

  it("le prorata garde le cycle et la devise de l'abonnement en cours", () => {
    const q = quoteCheckout(
      sub({
        billingCycle: "yearly",
        currency: "USD",
        currentPeriodStart: new Date(NOW.getTime() - (365 * DAY) / 2),
        currentPeriodEnd: new Date(NOW.getTime() + (365 * DAY) / 2),
      }),
      { plan: "pro", cycle: "monthly", currency: "XAF" },
      prices,
      NOW,
    );
    expect(q).toMatchObject({ kind: "upgrade", cycle: "yearly", currency: "USD", amount: 95 });
  });

  it("montant minimal pour un prorata presque nul", () => {
    const q = quoteCheckout(
      sub({ currentPeriodEnd: new Date(NOW.getTime() + 60_000) }),
      { plan: "pro", cycle: "monthly", currency: "XAF" },
      prices,
      NOW,
    );
    expect(q.amount).toBe(100);
  });

  it("renouvellement, essai et compte expiré : plein tarif", () => {
    expect(
      quoteCheckout(sub({}), { plan: "essential", cycle: "yearly", currency: "XAF" }, prices, NOW),
    ).toMatchObject({ kind: "renewal", amount: 50000 });
    expect(
      quoteCheckout(
        sub({ plan: "pro" }),
        { plan: "essential", cycle: "monthly", currency: "XAF" },
        prices,
        NOW,
      ),
    ).toMatchObject({ kind: "renewal", amount: 5000 });
    expect(
      quoteCheckout(
        sub({ state: "trial", plan: "trial" }),
        { plan: "pro", cycle: "monthly", currency: "USD" },
        prices,
        NOW,
      ),
    ).toMatchObject({ kind: "new", amount: 29 });
    expect(
      quoteCheckout(
        sub({ state: "free" }),
        { plan: "pro", cycle: "monthly", currency: "XAF" },
        prices,
        NOW,
      ),
    ).toMatchObject({ kind: "new", amount: 15000 });
    expect(
      quoteCheckout(
        sub({ state: "grace" }),
        { plan: "pro", cycle: "monthly", currency: "XAF" },
        prices,
        NOW,
      ).kind,
    ).toBe("renewal");
  });

  it("pas de prorata si l'abonnement est annulé", () => {
    expect(
      quoteCheckout(
        sub({ cancelAtPeriodEnd: true }),
        { plan: "pro", cycle: "monthly", currency: "XAF" },
        prices,
        NOW,
      ).kind,
    ).toBe("renewal");
  });

  it("arrondis par devise", () => {
    expect(roundAmount(6666.67, "XAF")).toBe(6670);
    expect(roundAmount(8.501, "USD")).toBe(8.51);
    expect(roundAmount(12.5, "EUR")).toBe(12.5);
    expect(roundAmount(7.001, "GBP")).toBe(7.01);
    expect(roundAmount(101, "XAF")).toBe(105);
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

const DEPOSIT_ID = "1b4d9b0e-6c2a-4f6e-9d3a-2f1e8c7b6a50";
const checkoutRequest = {
  reference: DEPOSIT_ID,
  amount: 5000,
  currency: "XAF" as const,
  description: "Abonnement Essentiel — mensuel",
  productName: "QuickSign Essentiel",
  language: "fr" as const,
  customer: { email: "a@b.cm", name: "Awa Ngono", phone: "+237 690 00 00 00" },
  redirectUrl: `https://quicksign.app/api/billing/return?ref=${DEPOSIT_ID}`,
  meta: { user_id: "u", payment_id: "p" },
};

function jsonFetcher(status: number, body: unknown) {
  return vi.fn(async () => new Response(JSON.stringify(body), { status }));
}

describe("Notch Pay (Mobile Money et carte, FCFA)", () => {
  const TRX = "trx.test_abc123";

  it("crée le paiement au montant exact, avec notre référence et l'URL de retour", async () => {
    const fetcher = jsonFetcher(201, {
      status: "Accepted",
      authorization_url: "https://pay.notchpay.co/trx.test_abc123",
      transaction: { reference: TRX, merchant_reference: DEPOSIT_ID },
    });
    const provider = new NotchPayProvider("pk.live", undefined, fetcher as unknown as typeof fetch);
    const result = await provider.createCheckout(checkoutRequest);
    expect(result).toEqual({ url: "https://pay.notchpay.co/trx.test_abc123", transactionId: TRX });
    const [endpoint, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(endpoint).toBe("https://api.notchpay.co/payments");
    expect((init.headers as Record<string, string>).Authorization).toBe("pk.live");
    const body = JSON.parse(String(init.body));
    expect(body).toMatchObject({
      amount: 5000,
      currency: "XAF",
      email: "a@b.cm",
      reference: DEPOSIT_ID,
      callback: checkoutRequest.redirectUrl,
    });
  });

  it("ancienne route d'initialisation si /payments n'existe pas ; erreur remontée", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response("{}", { status: 404 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ authorization_url: "https://pay.notchpay.co/x" }), {
          status: 201,
        }),
      );
    const provider = new NotchPayProvider("pk.live", undefined, fetcher as unknown as typeof fetch);
    expect((await provider.createCheckout(checkoutRequest)).url).toBe("https://pay.notchpay.co/x");
    expect((fetcher.mock.calls[1] as unknown as [string])[0]).toBe(
      "https://api.notchpay.co/payments/initialize",
    );

    const failing = new NotchPayProvider(
      "pk.live",
      undefined,
      jsonFetcher(422, { message: "Invalid amount" }) as unknown as typeof fetch,
    );
    await expect(failing.createCheckout(checkoutRequest)).rejects.toThrow(
      "Notch Pay 422: Invalid amount",
    );
    await expect(
      failing.createCheckout({ ...checkoutRequest, reference: "pas-un-uuid" }),
    ).rejects.toThrow("UUID v4");
  });

  it("revérifie la transaction par l'API et exige notre référence", async () => {
    const complete = jsonFetcher(200, {
      transaction: {
        reference: TRX,
        merchant_reference: DEPOSIT_ID,
        status: "complete",
        amount: 5000,
        currency: "XAF",
        sandbox: false,
        payment_method: "cm.mtn",
      },
    });
    const provider = new NotchPayProvider(
      "pk.live",
      undefined,
      complete as unknown as typeof fetch,
    );
    const tx = await provider.verifyTransaction({ reference: DEPOSIT_ID, transactionId: TRX });
    expect((complete.mock.calls[0] as unknown as [string])[0]).toBe(
      `https://api.notchpay.co/payments/${TRX}`,
    );
    expect(tx).toEqual({
      status: "successful",
      reference: DEPOSIT_ID,
      transactionId: TRX,
      amount: 5000,
      currency: "XAF",
      method: "cm.mtn",
      failureReason: null,
    });

    // Transaction réussie d'un autre paiement : sa référence ne correspond pas.
    const other = new NotchPayProvider(
      "pk.live",
      undefined,
      jsonFetcher(200, {
        transaction: { reference: TRX, merchant_reference: "autre", status: "complete" },
      }) as unknown as typeof fetch,
    );
    const mismatch = await other.verifyTransaction({ reference: DEPOSIT_ID, transactionId: TRX });
    expect(mismatch?.reference).not.toBe(DEPOSIT_ID);

    // Paiement de test présenté à une clé de production : jamais accepté.
    const sandboxTx = new NotchPayProvider(
      "pk.live",
      undefined,
      jsonFetcher(200, {
        transaction: {
          reference: TRX,
          merchant_reference: DEPOSIT_ID,
          status: "complete",
          amount: 5000,
          currency: "XAF",
          sandbox: true,
        },
      }) as unknown as typeof fetch,
    );
    expect(
      await sandboxTx.verifyTransaction({ reference: DEPOSIT_ID, transactionId: TRX }),
    ).toMatchObject({ status: "failed", failureReason: "sandbox_transaction" });

    const missing = new NotchPayProvider(
      "pk.live",
      undefined,
      jsonFetcher(404, { message: "Not found" }) as unknown as typeof fetch,
    );
    expect(
      await missing.verifyTransaction({ reference: DEPOSIT_ID, transactionId: null }),
    ).toBeNull();
  });

  it("notification : signature exigée si une clé est configurée ; seule la référence est retenue", () => {
    const body = JSON.stringify({
      id: "evt_1",
      event: "payment.complete",
      data: { reference: TRX, merchant_reference: DEPOSIT_ID, status: "complete" },
    });
    const open = new NotchPayProvider("pk.live");
    expect(open.parseWebhook(new Headers(), body)).toMatchObject({
      key: "evt_1",
      type: "payment.complete",
      reference: DEPOSIT_ID,
      transactionId: TRX,
    });
    expect(open.parseWebhook(new Headers(), "pas du json")).toBeNull();
    expect(open.parseWebhook(new Headers(), JSON.stringify({ data: {} }))).toBeNull();

    const secret = "webhook-hash";
    const signed = new NotchPayProvider("pk.live", secret);
    const signature = createHmac("sha256", secret).update(body).digest("hex");
    expect(
      signed.parseWebhook(new Headers({ "x-notch-signature": signature }), body)?.reference,
    ).toBe(DEPOSIT_ID);
    expect(signed.parseWebhook(new Headers(), body)).toBeNull();
    expect(
      signed.parseWebhook(new Headers({ "x-notch-signature": "0".repeat(64) }), body),
    ).toBeNull();
    expect(verifyNotchPaySignature(signature, `${body} `, secret)).toBe(false);
  });

  it("statuts et moyens de paiement", () => {
    expect(mapNotchPayStatus("complete")).toBe("successful");
    expect(mapNotchPayStatus("failed")).toBe("failed");
    expect(mapNotchPayStatus("canceled")).toBe("failed");
    expect(mapNotchPayStatus("expired")).toBe("failed");
    expect(mapNotchPayStatus("pending")).toBe("pending");
    expect(mapNotchPayStatus("processing")).toBe("pending");
    expect(paymentMethodLabel("cm.mtn")).toBe("Mobile Money (MTN)");
    expect(paymentMethodLabel("cm.orange")).toBe("Orange Money");
    expect(paymentMethodLabel("cm.mobile")).toBe("Mobile Money");
    expect(paymentMethodLabel("card")).toBe("Carte bancaire");
    expect(paymentMethodLabel("paypal")).toBe("PayPal");
  });
});

describe("franc CFA", () => {
  it("XAF et XOF ont la même valeur ; pays suggéré d'après le profil ou l'indicatif", () => {
    expect(sameCfaCurrency("XOF", "XAF")).toBe(true);
    expect(sameCfaCurrency("EUR", "XAF")).toBe(false);
    expect(suggestedCountry(null, ["CMR", "SEN"], "SN")).toBe("SEN");
    expect(suggestedCountry("+221 77 000 00 00", ["CMR", "SEN"])).toBe("SEN");
    expect(suggestedCountry(null, [])).toBe("CMR");
  });
});

describe("bac à sable", () => {
  it("n'accepte que des identifiants signés par le serveur", async () => {
    const sandbox = new SandboxProvider("server-secret");
    const id = sandbox.transactionId("QS-1", "successful", "mtn");
    const expected = { amount: 5000, currency: "XAF" as const };
    expect(
      await sandbox.verifyTransaction({ reference: "QS-1", transactionId: id, expected }),
    ).toMatchObject({ status: "successful", amount: 5000, method: "mobilemoney_mtn" });
    // Même identifiant pour une autre référence, ou signature fabriquée : refusé.
    expect(
      await sandbox.verifyTransaction({ reference: "QS-2", transactionId: id, expected }),
    ).toBeNull();
    expect(
      await sandbox.verifyTransaction({
        reference: "QS-1",
        transactionId: id.replace("successful", "failed"),
        expected,
      }),
    ).toBeNull();
    expect(
      await new SandboxProvider("autre").verifyTransaction({
        reference: "QS-1",
        transactionId: id,
        expected,
      }),
    ).toBeNull();
  });
});

describe("reçu PDF", () => {
  it("génère un reçu A4 numéroté", async () => {
    const bytes = await renderReceipt({
      number: "QS-2026-000042",
      paidAt: NOW,
      customer: {
        name: "Awa Ngono",
        email: "awa@example.cm",
        organization: "Cabinet Ngono & Associés",
      },
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

  it("en anglais, dans la devise et le fuseau du client", async () => {
    const bytes = await renderReceipt({
      number: "QS-2026-000043",
      paidAt: NOW,
      customer: { name: "John Smith", email: "john@example.com" },
      description: paymentDescription("pro", "yearly", "new", "en"),
      periodStart: NOW,
      periodEnd: new Date(NOW.getTime() + 365 * DAY),
      amount: 250,
      currency: "EUR",
      method: paymentMethodLabel("card", "en"),
      reference: "QS-1a2b",
      transactionId: "txn_1",
      seller: { name: "QuickSign", url: "https://quicksign.app", email: "support@quicksign.app" },
      timeZone: "Europe/Paris",
      locale: "en",
    });
    const pdf = await PDFDocument.load(bytes, { updateMetadata: false });
    expect(pdf.getTitle()).toBe("Receipt QS-2026-000043");
    expect(paymentMethodLabel("card", "en")).toBe("Card");
    expect(paymentDescription("pro", "yearly", "new", "en")).toBe("Pro subscription — yearly");
    expect(paymentDescription("essential", "monthly", "upgrade")).toBe(
      "Abonnement Essentiel — mensuel (passage au Pro, au prorata)",
    );
  });
});
