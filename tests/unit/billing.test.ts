import { createHmac } from "node:crypto";
import { PDFDocument } from "pdf-lib";
import { describe, expect, it, vi } from "vitest";
import {
  PaddleProvider,
  fromMinorUnits,
  mapTransactionStatus,
  verifyPaddleSignature,
} from "@/lib/billing/paddle";
import {
  PawaPayProvider,
  customerMessage,
  mapDepositStatus,
  payerCountry,
} from "@/lib/billing/pawapay";
import {
  quoteCheckout,
  roundAmount,
  type PriceTable,
  type QuoteSubscription,
} from "@/lib/billing/quote";
import { paymentMethodLabel, renderReceipt } from "@/lib/billing/receipt";
import { SandboxProvider } from "@/lib/billing/sandbox";
import { reminderBucket } from "@/lib/billing/service";
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
    expect(q).toMatchObject({ kind: "upgrade", cycle: "yearly", currency: "USD", amount: 85 });
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
    ).toMatchObject({ kind: "new", amount: 26 });
    expect(
      quoteCheckout(
        sub({ state: "expired" }),
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

describe("pawaPay (Mobile Money, FCFA)", () => {
  it("crée une page de paiement pawaPay avec montant, téléphone et message valides", async () => {
    const fetcher = jsonFetcher(200, { redirectUrl: "https://paywith.pawapay.io/?token=abc" });
    const provider = new PawaPayProvider("tok", "sandbox", fetcher as unknown as typeof fetch);
    const { url } = await provider.createCheckout(checkoutRequest);
    expect(url).toBe("https://paywith.pawapay.io/?token=abc");
    const [endpoint, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(endpoint).toBe("https://api.sandbox.pawapay.io/v2/paymentpage");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok");
    const body = JSON.parse(String(init.body));
    expect(body).toMatchObject({
      depositId: DEPOSIT_ID,
      returnUrl: checkoutRequest.redirectUrl,
      amountDetails: { amount: "5000", currency: "XAF" },
      phoneNumber: "237690000000",
      country: "CMR",
      language: "FR",
    });
    expect(body.customerMessage).toMatch(/^[A-Za-z0-9 ]{4,22}$/);
    expect(body.metadata).toEqual([{ user_id: "u" }, { payment_id: "p" }]);
  });

  it("refuse une référence qui n'est pas un UUID v4 ; erreur pawaPay remontée", async () => {
    const provider = new PawaPayProvider(
      "tok",
      "production",
      jsonFetcher(400, {
        status: "REJECTED",
        failureReason: { failureCode: "INVALID_AMOUNT", failureMessage: "Amount too small" },
      }) as unknown as typeof fetch,
    );
    await expect(
      provider.createCheckout({ ...checkoutRequest, reference: "QS-1" }),
    ).rejects.toThrow(/UUID/);
    await expect(provider.createCheckout(checkoutRequest)).rejects.toThrow(
      /INVALID_AMOUNT — Amount too small/,
    );
  });

  it("revérifie le dépôt par l'API ; dépôt introuvable → null", async () => {
    const found = jsonFetcher(200, {
      status: "FOUND",
      data: {
        depositId: DEPOSIT_ID,
        status: "COMPLETED",
        amount: "5000",
        currency: "XAF",
        providerTransactionId: "MP123",
        payer: {
          type: "MMO",
          accountDetails: { phoneNumber: "237690000000", provider: "MTN_MOMO_CMR" },
        },
      },
    });
    const provider = new PawaPayProvider("tok", "production", found as unknown as typeof fetch);
    const tx = await provider.verifyTransaction({ reference: DEPOSIT_ID, transactionId: null });
    expect((found.mock.calls[0] as unknown as [string])[0]).toBe(
      `https://api.pawapay.io/v2/deposits/${DEPOSIT_ID}`,
    );
    expect(tx).toMatchObject({
      status: "successful",
      amount: 5000,
      currency: "XAF",
      transactionId: "MP123",
      method: "MTN_MOMO_CMR",
    });

    const failed = new PawaPayProvider(
      "tok",
      "production",
      jsonFetcher(200, {
        status: "FOUND",
        data: {
          depositId: DEPOSIT_ID,
          status: "FAILED",
          amount: "5000",
          currency: "XAF",
          failureReason: { failureCode: "PAYER_LIMIT_REACHED", failureMessage: "Limite atteinte" },
        },
      }) as unknown as typeof fetch,
    );
    expect(
      await failed.verifyTransaction({ reference: DEPOSIT_ID, transactionId: null }),
    ).toMatchObject({ status: "failed", failureReason: "Limite atteinte" });

    const missing = new PawaPayProvider(
      "tok",
      "production",
      jsonFetcher(200, { status: "NOT_FOUND" }) as unknown as typeof fetch,
    );
    expect(
      await missing.verifyTransaction({ reference: DEPOSIT_ID, transactionId: null }),
    ).toBeNull();
  });

  it("notification : seule la référence est retenue, le contenu sera revérifié", () => {
    const provider = new PawaPayProvider("tok", "production");
    const event = provider.parseWebhook(
      new Headers(),
      JSON.stringify({ depositId: DEPOSIT_ID, status: "COMPLETED", amount: "1" }),
    );
    expect(event).toMatchObject({
      key: `${DEPOSIT_ID}:COMPLETED`,
      reference: DEPOSIT_ID,
      transactionId: null,
    });
    expect(provider.parseWebhook(new Headers(), "pas du json")).toBeNull();
    expect(provider.parseWebhook(new Headers(), JSON.stringify({ depositId: "x" }))).toBeNull();
  });

  it("pays toujours transmis avec le montant (exigence pawaPay)", () => {
    expect(payerCountry("+237 690 00 00 00")).toEqual({
      country: "CMR",
      phoneNumber: "237690000000",
    });
    expect(payerCountry("+241 06 12 34 56")).toEqual({
      country: "GAB",
      phoneNumber: "24106123456",
    });
    // Sans numéro, ou numéro hors zone FCFA : Cameroun, le client saisit son numéro chez pawaPay.
    expect(payerCountry(null)).toEqual({ country: "CMR" });
    expect(payerCountry("+33 6 12 34 56 78")).toEqual({ country: "CMR" });
  });

  it("statuts et message client", () => {
    expect(mapDepositStatus("COMPLETED")).toBe("successful");
    expect(mapDepositStatus("FAILED")).toBe("failed");
    expect(mapDepositStatus("PROCESSING")).toBe("pending");
    expect(mapDepositStatus("IN_RECONCILIATION")).toBe("pending");
    expect(customerMessage("QuickSign Abonnement Pro — annuel (prorata)")).toBe(
      "QuickSign Abonnement P",
    );
    expect(customerMessage("—")).toBe("QuickSign");
  });
});

describe("Paddle (carte, international)", () => {
  const SECRET = "pdl_ntfset_secret";

  it("crée une transaction au prix exact, liée à notre référence", async () => {
    const fetcher = jsonFetcher(201, {
      data: {
        id: "txn_01abc",
        status: "ready",
        checkout: { url: "https://quicksign.app/app/abonnement/paiement?_ptxn=txn_01abc" },
      },
    });
    const provider = new PaddleProvider(
      "pdl_sdbx_apikey_x",
      "sandbox",
      SECRET,
      fetcher as unknown as typeof fetch,
    );
    const result = await provider.createCheckout({
      ...checkoutRequest,
      amount: 9.99,
      currency: "USD",
      checkoutPageUrl: "https://quicksign.app/app/abonnement/paiement",
    });
    expect(result).toEqual({
      url: "https://quicksign.app/app/abonnement/paiement?_ptxn=txn_01abc",
      transactionId: "txn_01abc",
    });
    const [endpoint, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(endpoint).toBe("https://sandbox-api.paddle.com/transactions");
    const body = JSON.parse(String(init.body));
    expect(body.items[0].price.unit_price).toEqual({ amount: "999", currency_code: "USD" });
    expect(body.items[0].price.product).toEqual({
      name: "QuickSign Essentiel",
      tax_category: "standard",
    });
    expect(body.custom_data).toMatchObject({ reference: DEPOSIT_ID, user_id: "u" });
    expect(body.checkout).toEqual({ url: "https://quicksign.app/app/abonnement/paiement" });
  });

  it("une erreur de Paddle est remontée clairement", async () => {
    const provider = new PaddleProvider(
      "k",
      "production",
      SECRET,
      jsonFetcher(400, {
        error: { code: "transaction_checkout_url_domain_is_not_approved", detail: "Domain" },
      }) as unknown as typeof fetch,
    );
    await expect(
      provider.createCheckout({
        ...checkoutRequest,
        currency: "USD",
        checkoutPageUrl: "https://x.y",
      }),
    ).rejects.toThrow(/transaction_checkout_url_domain_is_not_approved — Domain/);
  });

  it("revérifie la transaction et sa référence auprès de Paddle", async () => {
    const tx = {
      id: "txn_01abc",
      status: "completed",
      currency_code: "USD",
      custom_data: { reference: DEPOSIT_ID },
      details: { totals: { total: "1199", grand_total: "1199" } },
      payments: [{ status: "captured", method_details: { type: "card" } }],
    };
    const fetcher = jsonFetcher(200, { data: tx });
    const provider = new PaddleProvider(
      "k",
      "production",
      SECRET,
      fetcher as unknown as typeof fetch,
    );
    expect(
      await provider.verifyTransaction({ reference: DEPOSIT_ID, transactionId: "txn_01abc" }),
    ).toMatchObject({
      status: "successful",
      amount: 11.99,
      currency: "USD",
      method: "card",
      transactionId: "txn_01abc",
    });
    expect((fetcher.mock.calls[0] as unknown as [string])[0]).toBe(
      "https://api.paddle.com/transactions/txn_01abc",
    );
    // Transaction d'un autre paiement, ou identifiant absent : rien n'est accepté.
    expect(
      await provider.verifyTransaction({ reference: "autre", transactionId: "txn_01abc" }),
    ).toBeNull();
    expect(
      await provider.verifyTransaction({ reference: DEPOSIT_ID, transactionId: null }),
    ).toBeNull();
  });

  it("notification : signature Paddle-Signature vérifiée, horodatage récent exigé", () => {
    const provider = new PaddleProvider("k", "production", SECRET);
    const body = JSON.stringify({
      event_id: "evt_1",
      event_type: "transaction.completed",
      data: { id: "txn_01abc", custom_data: { reference: DEPOSIT_ID } },
    });
    const ts = Math.floor(Date.now() / 1000);
    const h1 = createHmac("sha256", SECRET).update(`${ts}:${body}`).digest("hex");
    const signed = new Headers({ "Paddle-Signature": `ts=${ts};h1=${h1}` });
    expect(provider.parseWebhook(signed, body)).toMatchObject({
      key: "evt_1",
      type: "transaction.completed",
      reference: DEPOSIT_ID,
      transactionId: "txn_01abc",
    });
    expect(provider.parseWebhook(signed, body.replace("txn_01abc", "txn_02xyz"))).toBeNull();
    expect(provider.parseWebhook(new Headers(), body)).toBeNull();
    expect(verifyPaddleSignature(`ts=${ts - 3600};h1=${h1}`, body, SECRET)).toBe(false);
    expect(new PaddleProvider("k", "production", undefined).parseWebhook(signed, body)).toBeNull();
  });

  it("statuts, montants et moyens de paiement", () => {
    expect(mapTransactionStatus("completed")).toBe("successful");
    expect(mapTransactionStatus("paid")).toBe("successful");
    expect(mapTransactionStatus("canceled")).toBe("failed");
    expect(mapTransactionStatus("ready")).toBe("pending");
    expect(fromMinorUnits("1999", "USD")).toBe(19.99);
    expect(paymentMethodLabel("MTN_MOMO_CMR")).toBe("Mobile Money (MTN)");
    expect(paymentMethodLabel("ORANGE_CMR")).toBe("Orange Money");
    expect(paymentMethodLabel("card")).toBe("Carte bancaire");
    expect(paymentMethodLabel("paypal")).toBe("PayPal");
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
});
