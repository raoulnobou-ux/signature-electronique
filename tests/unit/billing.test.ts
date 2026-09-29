import { createHmac } from "node:crypto";
import { PDFDocument } from "pdf-lib";
import { describe, expect, it, vi } from "vitest";
import {
  CinetPayProvider,
  mapStatus,
  notificationToken,
  parseNotificationBody,
} from "@/lib/billing/cinetpay";
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

describe("CinetPay", () => {
  const SECRET = "cle-secrete";
  const notification: Record<string, string> = {
    cpm_site_id: "105",
    cpm_trans_id: "QS-ABC123",
    cpm_trans_date: "2026-09-28 11:02:43",
    cpm_amount: "5000",
    cpm_currency: "XAF",
    signature: "sig",
    payment_method: "OMCM",
    cel_phone_num: "690000000",
    cpm_phone_prefixe: "237",
    cpm_language: "fr",
    cpm_version: "V4",
    cpm_payment_config: "Single",
    cpm_page_action: "Payment",
    cpm_custom: "",
    cpm_designation: "Abonnement",
    cpm_error_message: "SUCCES",
  };
  const body = new URLSearchParams(notification).toString();
  // Jeton calculé indépendamment : HMAC-SHA256 (hex) des champs concaténés dans l'ordre documenté.
  const token = createHmac("sha256", SECRET)
    .update(Object.values(notification).join(""))
    .digest("hex");

  it("jeton x-token : HMAC-SHA256 des champs dans l'ordre de la documentation", () => {
    expect(notificationToken(parseNotificationBody(body), SECRET)).toBe(token);
    expect(parseNotificationBody(JSON.stringify(notification))).toEqual(notification);
  });

  it("n'accepte que les notifications signées de notre site", () => {
    const provider = new CinetPayProvider("api", "105", SECRET);
    const event = provider.parseWebhook(new Headers({ "x-token": token }), body);
    expect(event).toMatchObject({ reference: "QS-ABC123", transactionId: "QS-ABC123" });
    expect(event!.key).toMatch(/^notify:QS-ABC123:/);
    expect(
      provider.parseWebhook(new Headers({ "x-token": token }), body.replace("5000", "50")),
    ).toBeNull();
    expect(provider.parseWebhook(new Headers({ "x-token": "0".repeat(64) }), body)).toBeNull();
    expect(provider.parseWebhook(new Headers(), body)).toBeNull();
    expect(
      new CinetPayProvider("api", "999", SECRET).parseWebhook(
        new Headers({ "x-token": token }),
        body,
      ),
    ).toBeNull();
    expect(
      new CinetPayProvider("api", "105", undefined).parseWebhook(
        new Headers({ "x-token": token }),
        body,
      ),
    ).toBeNull();
  });

  it("revérifie la transaction par l'API /payment/check", async () => {
    const fetcher = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            code: "00",
            message: "SUCCES",
            data: {
              amount: "5000",
              currency: "XAF",
              status: "ACCEPTED",
              payment_method: "MOMOCM",
              operator_id: "MP2609.1102",
            },
          }),
        ),
    );
    const provider = new CinetPayProvider(
      "api-key",
      "105",
      SECRET,
      fetcher as unknown as typeof fetch,
    );
    const tx = await provider.verifyTransaction({
      reference: "QS-ABC123",
      transactionId: null,
      expected: { amount: 1, currency: "XAF" },
    });
    expect(tx).toMatchObject({
      status: "successful",
      amount: 5000,
      currency: "XAF",
      method: "MOMOCM",
      transactionId: "MP2609.1102",
      reference: "QS-ABC123",
    });
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api-checkout.cinetpay.com/v2/payment/check");
    expect(JSON.parse(init.body as string)).toEqual({
      apikey: "api-key",
      site_id: "105",
      transaction_id: "QS-ABC123",
    });
  });

  it("paiement refusé → échec ; transaction inconnue → null", async () => {
    const refused = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            code: "627",
            message: "TRANSACTION_CANCEL",
            data: { amount: "5000", currency: "XAF", status: "REFUSED" },
          }),
        ),
    );
    const p1 = new CinetPayProvider("k", "105", SECRET, refused as unknown as typeof fetch);
    expect(await p1.verifyTransaction({ reference: "QS-1", transactionId: null })).toMatchObject({
      status: "failed",
      failureReason: "TRANSACTION_CANCEL",
    });
    const unknown = vi.fn(
      async () =>
        new Response(JSON.stringify({ code: "662", message: "WAITING_CUSTOMER_PAYMENT" })),
    );
    const p2 = new CinetPayProvider("k", "105", SECRET, unknown as unknown as typeof fetch);
    expect(await p2.verifyTransaction({ reference: "QS-1", transactionId: null })).toBeNull();
  });

  it("crée un checkout Mobile Money + carte en FCFA, carte seule en dollars", async () => {
    const fetcher = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            code: "201",
            message: "CREATED",
            data: { payment_token: "t", payment_url: "https://checkout.cinetpay.com/payment/t" },
          }),
        ),
    );
    const provider = new CinetPayProvider(
      "api-key",
      "105",
      SECRET,
      fetcher as unknown as typeof fetch,
    );
    const request = {
      reference: "QS-1",
      amount: 5000,
      currency: "XAF" as const,
      description: "Abonnement Essentiel — mensuel",
      customer: {
        email: "a@b.cm",
        name: "Awa Ngono Mballa",
        phone: "+237690000000",
        city: "Yaoundé",
      },
      redirectUrl: "https://quicksign.app/api/billing/return?ref=QS-1",
      notifyUrl: "https://quicksign.app/api/webhooks/cinetpay",
      meta: { user_id: "u" },
    };
    const { url } = await provider.createCheckout(request);
    expect(url).toBe("https://checkout.cinetpay.com/payment/t");
    const sent = JSON.parse(
      (fetcher.mock.calls[0] as unknown as [string, RequestInit])[1].body as string,
    );
    expect(sent).toMatchObject({
      apikey: "api-key",
      site_id: "105",
      transaction_id: "QS-1",
      amount: 5000,
      currency: "XAF",
      channels: "ALL",
      notify_url: "https://quicksign.app/api/webhooks/cinetpay",
      return_url: "https://quicksign.app/api/billing/return?ref=QS-1",
      customer_name: "Awa",
      customer_surname: "Ngono Mballa",
      customer_city: "Yaoundé",
      customer_country: "CM",
    });
    await provider.createCheckout({ ...request, currency: "USD", amount: 9 });
    expect(
      JSON.parse((fetcher.mock.calls[1] as unknown as [string, RequestInit])[1].body as string)
        .channels,
    ).toBe("CREDIT_CARD");
  });

  it("une erreur de CinetPay est remontée clairement", async () => {
    const fetcher = vi.fn(
      async () =>
        new Response(JSON.stringify({ code: "608", message: "MINIMUM_REQUIRED_FIELDS" }), {
          status: 400,
        }),
    );
    const provider = new CinetPayProvider("k", "105", SECRET, fetcher as unknown as typeof fetch);
    await expect(
      provider.createCheckout({
        reference: "QS-1",
        amount: 1,
        currency: "XAF",
        description: "x",
        customer: { email: "a@b.cm", name: "", phone: null },
        redirectUrl: "https://x",
        notifyUrl: "https://x",
        meta: {},
      }),
    ).rejects.toThrow(/MINIMUM_REQUIRED_FIELDS/);
  });

  it("statuts et moyens de paiement", () => {
    expect(mapStatus("ACCEPTED")).toBe("successful");
    expect(mapStatus("REFUSED")).toBe("failed");
    expect(mapStatus("EXPIRED")).toBe("failed");
    expect(mapStatus("PENDING")).toBe("pending");
    expect(paymentMethodLabel("OMCM")).toBe("Orange Money");
    expect(paymentMethodLabel("MOMOCM")).toBe("Mobile Money (MTN)");
    expect(paymentMethodLabel("VISAM")).toBe("Carte bancaire");
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
