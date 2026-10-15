import { createHmac } from "node:crypto";
import { PDFDocument } from "pdf-lib";
import { describe, expect, it, vi } from "vitest";
import {
  NotchPayProvider,
  mapNotchPayStatus,
  notchPayFailureDetail,
  notchPayMethod,
  usableChannels,
  verifyNotchPaySignature,
} from "@/lib/billing/providers/african/notchpay";
import { failureKind, failureText } from "@/lib/billing/failure";
import { paymentFailedEmail } from "@/lib/email/templates";
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
import { providerErrorKind } from "@/lib/billing/providers/types";

vi.mock("@/lib/audit", () => ({ recordAudit: vi.fn() }));
vi.mock("@/lib/monitoring/app-errors", () => ({ logAppError: vi.fn() }));
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
  it("Essentiel → Pro sans prorata (prix fixes, Chariow) : plein tarif, à la suite de la période", () => {
    const q = quoteCheckout(
      sub({}),
      { plan: "pro", cycle: "monthly", currency: "XAF" },
      prices,
      NOW,
      { prorata: false },
    );
    // Renouvellement vers le Pro : complete_payment le fait démarrer à la fin de l'Essentiel payé.
    expect(q).toEqual({
      kind: "renewal",
      plan: "pro",
      cycle: "monthly",
      currency: "XAF",
      amount: 15000,
      fullPrice: 15000,
    });
  });

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

  it("échec de création : catégorie de l'erreur conservée pour le diagnostic", async () => {
    const kindOf = async (fetcher: unknown) => {
      const provider = new NotchPayProvider("pk.live", "h", fetcher as typeof fetch);
      return provider.createCheckout(checkoutRequest).then(
        () => null,
        (error: unknown) => providerErrorKind(error),
      );
    };
    expect(await kindOf(jsonFetcher(401, { message: "Invalid API credentials" }))).toBe("config");
    expect(await kindOf(jsonFetcher(422, { message: "Invalid amount" }))).toBe("rejected");
    expect(await kindOf(jsonFetcher(503, {}))).toBe("unavailable");
    expect(await kindOf(jsonFetcher(201, { status: "Accepted" }))).toBe("invalid_response");
    expect(await kindOf(vi.fn().mockRejectedValue(new TypeError("fetch failed")))).toBe("network");
    const timeout = new Error("timeout");
    timeout.name = "TimeoutError";
    expect(await kindOf(vi.fn().mockRejectedValue(timeout))).toBe("timeout");
    // Le message de Notch Pay est gardé, numéro de téléphone masqué.
    const masked = await new NotchPayProvider(
      "pk.live",
      "h",
      jsonFetcher(422, { message: "Numéro +237670000001 invalide" }) as unknown as typeof fetch,
    )
      .createCheckout(checkoutRequest)
      .catch((error: Error) => error.message);
    expect(masked).toBe("Notch Pay 422: Numéro [numéro] invalide");
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

    // Notch Pay renvoie aussi « 1 » pour une transaction de test.
    const sandboxOne = new NotchPayProvider(
      "pk.live",
      undefined,
      jsonFetcher(200, {
        transaction: {
          reference: TRX,
          merchant_reference: DEPOSIT_ID,
          status: "complete",
          sandbox: 1,
        },
      }) as unknown as typeof fetch,
    );
    expect(
      (await sandboxOne.verifyTransaction({ reference: DEPOSIT_ID, transactionId: TRX }))?.status,
    ).toBe("failed");
    const testKey = new NotchPayProvider(
      "pk_test.x",
      undefined,
      jsonFetcher(200, {
        transaction: {
          reference: TRX,
          merchant_reference: DEPOSIT_ID,
          status: "complete",
          sandbox: "1",
          amount: 5000,
          currency: "XAF",
        },
      }) as unknown as typeof fetch,
    );
    expect(
      (await testKey.verifyTransaction({ reference: DEPOSIT_ID, transactionId: TRX }))?.status,
    ).toBe("successful");

    const missing = new NotchPayProvider(
      "pk.live",
      undefined,
      jsonFetcher(404, { message: "Not found" }) as unknown as typeof fetch,
    );
    expect(
      await missing.verifyTransaction({ reference: DEPOSIT_ID, transactionId: null }),
    ).toBeNull();
  });

  it("notification : signature toujours exigée ; seule la référence est retenue", () => {
    const body = JSON.stringify({
      id: "evt_1",
      event: "payment.complete",
      data: { reference: TRX, merchant_reference: DEPOSIT_ID, status: "complete" },
    });
    const secret = "webhook-hash";
    const sign = (raw: string) =>
      new Headers({ "x-notch-signature": createHmac("sha256", secret).update(raw).digest("hex") });

    // Sans clé de hachage configurée : aucune notification n'est acceptée.
    const open = new NotchPayProvider("pk.live");
    expect(open.parseWebhook(new Headers(), body)).toBeNull();
    expect(open.parseWebhook(sign(body), body)).toBeNull();

    const signed = new NotchPayProvider("pk.live", secret);
    expect(signed.parseWebhook(sign(body), body)).toMatchObject({
      key: "evt_1",
      type: "payment.complete",
      reference: DEPOSIT_ID,
      transactionId: TRX,
    });
    expect(signed.parseWebhook(new Headers(), body)).toBeNull();
    expect(
      signed.parseWebhook(new Headers({ "x-notch-signature": "0".repeat(64) }), body),
    ).toBeNull();
    // Corps modifié après signature (même d'un espace) : refusé.
    expect(signed.parseWebhook(sign(body), `${body} `)).toBeNull();
    expect(verifyNotchPaySignature(null, body, secret)).toBe(false);
    expect(verifyNotchPaySignature("pas-hexa", body, secret)).toBe(false);
    expect(signed.parseWebhook(sign("pas du json"), "pas du json")).toBeNull();
    const empty = JSON.stringify({ data: {} });
    expect(signed.parseWebhook(sign(empty), empty)).toBeNull();
  });

  it("notification : seuls les événements qui règlent un paiement sont traités", () => {
    const secret = "webhook-hash";
    const provider = new NotchPayProvider("pk.live", secret);
    const parse = (event: string) => {
      const raw = JSON.stringify({
        id: `evt_${event}`,
        event,
        data: { reference: TRX, merchant_reference: DEPOSIT_ID, status: "x" },
      });
      const signature = createHmac("sha256", secret).update(raw).digest("hex");
      return provider.parseWebhook(new Headers({ "x-notch-signature": signature }), raw);
    };
    for (const event of [
      "payment.complete",
      "payment.failed",
      "payment.canceled",
      "payment.expired",
    ]) {
      expect(parse(event)?.reference).toBe(DEPOSIT_ID);
    }
    // Noté (clé d'idempotence) mais sans référence : ignoré par le traitement.
    for (const event of ["payment.created", "transfer.complete", "customer.created"]) {
      expect(parse(event)).toMatchObject({
        key: `evt_${event}`,
        reference: null,
        transactionId: null,
      });
    }
  });

  it("canaux : seuls les canaux actifs (et ouverts en production avec une clé live) sont proposés", async () => {
    const items = [
      {
        id: "card",
        name: "Credit or debit Card",
        type: "card",
        active: false,
        live: false,
        currency: "XAF",
      },
      {
        id: "cm.mtn",
        name: "MTN Mobile Money",
        type: "mobile",
        active: true,
        live: true,
        currency: "XAF",
      },
      {
        id: "cm.orange",
        name: "Orange Money",
        type: "mobile",
        active: true,
        live: true,
        currency: "XAF",
      },
      {
        id: "yoomee",
        name: "Yoomee Money",
        type: "wallet",
        active: true,
        live: false,
        currency: "XAF",
      },
      { id: "ng.mtn", name: "MTN NG", type: "mobile", active: true, live: true, currency: "NGN" },
      { id: 42, name: null, active: true, live: true },
    ];
    expect(usableChannels(items, false).map((c) => c.id)).toEqual(["cm.mtn", "cm.orange"]);
    // Clé de test : un canal actif suffit, même non ouvert en production.
    expect(usableChannels(items, true).map((c) => c.id)).toEqual(["cm.mtn", "cm.orange", "yoomee"]);
    expect(usableChannels("pas une liste", false)).toEqual([]);

    const fetcher = jsonFetcher(200, { code: 200, items });
    const provider = new NotchPayProvider("pk.live", "h", fetcher as unknown as typeof fetch);
    expect((await provider.listChannels())?.map((c) => c.name)).toEqual([
      "MTN Mobile Money",
      "Orange Money",
    ]);
    // Mis en cache : un seul appel à Notch Pay.
    await provider.listChannels();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect((fetcher.mock.calls[0] as unknown as [string])[0]).toBe(
      "https://api.notchpay.co/channels?currency=XAF",
    );

    // Notch Pay injoignable ou réponse inattendue : null (affichage générique).
    const down = new NotchPayProvider(
      "pk.live",
      "h",
      vi.fn().mockRejectedValue(new Error("timeout")) as unknown as typeof fetch,
    );
    expect(await down.listChannels()).toBeNull();
    const odd = new NotchPayProvider(
      "pk.live",
      "h",
      jsonFetcher(200, { channels: [] }) as unknown as typeof fetch,
    );
    expect(await odd.listChannels()).toBeNull();
  });

  it("statuts et moyens de paiement", () => {
    expect(mapNotchPayStatus("complete")).toBe("successful");
    expect(mapNotchPayStatus("failed")).toBe("failed");
    expect(mapNotchPayStatus("canceled")).toBe("failed");
    expect(mapNotchPayStatus("expired")).toBe("failed");
    expect(mapNotchPayStatus("pending")).toBe("pending");
    expect(mapNotchPayStatus("processing")).toBe("pending");
    // Statuts finaux de la page « Collect » (dont l'orthographe « partialy » de Notch Pay).
    expect(mapNotchPayStatus("abandoned")).toBe("failed");
    expect(mapNotchPayStatus("refunded")).toBe("failed");
    expect(mapNotchPayStatus("partialy-refunded")).toBe("failed");
    expect(mapNotchPayStatus("COMPLETE")).toBe("successful");
    // Payé en partie : jamais une réussite.
    expect(mapNotchPayStatus("incomplete")).toBe("pending");
    expect(mapNotchPayStatus(undefined)).toBe("pending");
    expect(paymentMethodLabel("cm.mtn")).toBe("Mobile Money (MTN)");
    expect(paymentMethodLabel("cm.orange")).toBe("Orange Money");
    expect(paymentMethodLabel("cm.mobile")).toBe("Mobile Money");
    expect(notchPayMethod({ payment_method: "pm.test_cETH", channel: null })).toBe("notchpay");
    expect(notchPayMethod({ payment_method: "pm.x", channel: "cm.orange" })).toBe("cm.orange");
    expect(paymentMethodLabel("notchpay")).toBe("Notch Pay");
    const detail = notchPayFailureDetail({
      status: "failed",
      customer: { phone: "+237690000000", email: "a@b.cm" },
      charge: { channel: "cm.mtn", message: "Solde insuffisant pour +237690000000", phone: "x" },
    });
    expect(detail).toBe(
      "status=failed ; charge.channel=cm.mtn ; charge.message=Solde insuffisant pour [numéro]",
    );
    expect(detail).not.toContain("690000000");
    expect(paymentMethodLabel("card")).toBe("Carte bancaire");
    expect(paymentMethodLabel("paypal")).toBe("PayPal");
  });

  it("échec : message simple pour le client, jamais le code brut", () => {
    expect(failureKind("failed")).toBe("declined");
    expect(failureKind("rejected")).toBe("declined");
    expect(failureKind("canceled")).toBe("canceled");
    expect(failureKind("abandoned")).toBe("canceled");
    expect(failureKind("expired")).toBe("expired");
    expect(failureKind("amount_mismatch")).toBe("technical");
    expect(failureKind("checkout_error: Notch Pay 500")).toBe("technical");
    expect(failureKind(null)).toBe("declined");
    expect(failureText("expired", "fr")).toMatch(/délai/i);

    for (const locale of ["fr", "en"] as const) {
      for (const reason of ["failed", "amount_mismatch", "checkout_error: Notch Pay 500: boom"]) {
        const email = paymentFailedEmail({
          fullName: "Awa Ndzi",
          amount: "5 000 FCFA",
          reason,
          locale,
        });
        expect(email.text).not.toContain(reason);
        expect(email.html).not.toContain(reason);
        expect(email.text).toContain(failureText(reason, locale));
        expect(email.text).toContain("/app/abonnement");
      }
    }
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
