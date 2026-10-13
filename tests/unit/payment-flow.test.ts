import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NotchPayProvider } from "@/lib/billing/providers/african/notchpay";
import type { PaymentProvider, VerifiedTransaction } from "@/lib/billing/providers/types";

/**
 * Parcours critique d'un paiement, sans base ni prestataire réels :
 * notification (taille, signature, idempotence, événements ignorés) puis règlement
 * (revérification, montant et devise, activation unique).
 */

type Query = {
  table: string;
  op?: "select" | "insert" | "update";
  payload?: Record<string, unknown>;
  filters: [string, string, unknown][];
};
type Result = { data: unknown; error: unknown };

/** Client Supabase factice : chaque requête est notée puis résolue par `handler`. */
function fakeAdmin(handler: (q: Query) => Result) {
  const queries: Query[] = [];
  const from = (table: string) => {
    const q: Query = { table, filters: [] };
    const run = () => {
      queries.push(q);
      return handler(q);
    };
    const builder = {
      select: () => ((q.op ??= "select"), builder),
      insert: (payload: Record<string, unknown>) => (
        (q.op = "insert"),
        (q.payload = payload),
        builder
      ),
      update: (payload: Record<string, unknown>) => (
        (q.op = "update"),
        (q.payload = payload),
        builder
      ),
      eq: (k: string, v: unknown) => (q.filters.push(["eq", k, v]), builder),
      neq: (k: string, v: unknown) => (q.filters.push(["neq", k, v]), builder),
      in: (k: string, v: unknown) => (q.filters.push(["in", k, v]), builder),
      single: async () => run(),
      maybeSingle: async () => run(),
      then: (resolve: (r: Result) => unknown, reject: (e: unknown) => unknown) =>
        Promise.resolve(run()).then(resolve, reject),
    };
    return builder;
  };
  const rpc = vi.fn(async () => ({ data: [{ applied: true }], error: null }));
  return { from, rpc, queries };
}

const mocks = vi.hoisted(() => ({
  admin: null as unknown,
  provider: null as PaymentProvider | null,
  settle: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => mocks.admin }));
vi.mock("@/lib/audit", () => ({ recordAudit: vi.fn() }));
vi.mock("@/lib/monitoring/app-errors", () => ({ logAppError: vi.fn() }));
vi.mock("@/lib/email/send", () => ({ sendEmail: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: vi.fn(async () => true) }));
vi.mock("@/lib/request", () => ({ getClientIp: vi.fn(async () => "203.0.113.7") }));
vi.mock("@/lib/env", () => ({ publicEnv: { NEXT_PUBLIC_APP_URL: "http://localhost:3000" } }));
vi.mock("@/lib/env.server", () => ({ serverEnv: { SUPABASE_SERVICE_ROLE_KEY: "x".repeat(32) } }));
vi.mock("@/lib/billing", () => ({ providerByName: () => mocks.provider }));

const REF = "4f7b2c1e-8a3d-4b6e-9c2f-1a2b3c4d5e6f";
const TRX = "trx.kxCDL8eZLF5hSywWZuTXmroX";
const SECRET = "hsk_live_test_hash";

function notification(event: string, id = `evt_${event}`) {
  const body = JSON.stringify({
    id,
    event,
    data: { reference: TRX, merchant_reference: REF, status: "complete", amount: 5000 },
  });
  const signature = createHmac("sha256", SECRET).update(body).digest("hex");
  return new Request("https://quicksign.test/api/webhooks/notchpay", {
    method: "POST",
    headers: { "content-type": "application/json", "x-notch-signature": signature },
    body,
  });
}

describe("notification Notch Pay (webhook)", () => {
  const provider = new NotchPayProvider("pk.live", SECRET);
  let handlePaymentWebhook: typeof import("@/lib/billing/webhook").handlePaymentWebhook;

  beforeEach(async () => {
    vi.resetModules();
    mocks.settle.mockReset().mockResolvedValue({ outcome: "successful" });
    vi.doMock("@/lib/billing/service", () => ({ settlePayment: mocks.settle }));
    ({ handlePaymentWebhook } = await import("@/lib/billing/webhook"));
  });

  /** Journal des notifications : `seen` = déjà reçue (et traitée ou non). */
  const events = (seen?: { processed: boolean }) =>
    fakeAdmin((q) => {
      if (q.table !== "payment_events") return { data: null, error: null };
      if (q.op === "insert") {
        return seen
          ? { data: null, error: { code: "23505" } }
          : { data: { id: "ev-1" }, error: null };
      }
      if (q.op === "select") {
        return {
          data: { id: "ev-1", processed_at: seen?.processed ? "2026-10-13T14:00:00Z" : null },
          error: null,
        };
      }
      return { data: null, error: null };
    });

  it("refuse un corps trop gros avant de le lire", async () => {
    mocks.admin = events();
    const request = new Request("https://quicksign.test/api/webhooks/notchpay", {
      method: "POST",
      headers: { "content-length": "500000" },
      body: "x",
    });
    expect((await handlePaymentWebhook(provider, request)).status).toBe(413);
    expect(mocks.settle).not.toHaveBeenCalled();
  });

  it("refuse une notification non signée ou falsifiée, sans rien activer", async () => {
    mocks.admin = events();
    const forged = notification("payment.complete");
    const unsigned = new Request(forged.url, { method: "POST", body: await forged.text() });
    expect((await handlePaymentWebhook(provider, unsigned)).status).toBe(401);
    const wrong = new Request(forged.url, {
      method: "POST",
      headers: { "x-notch-signature": "a".repeat(64) },
      body: JSON.stringify({ event: "payment.complete", data: { merchant_reference: REF } }),
    });
    expect((await handlePaymentWebhook(provider, wrong)).status).toBe(401);
    expect(mocks.settle).not.toHaveBeenCalled();
  });

  it("première réception : le paiement est revérifié puis la notification marquée traitée", async () => {
    const admin = events();
    mocks.admin = admin;
    const response = await handlePaymentWebhook(provider, notification("payment.complete"));
    expect(response.status).toBe(200);
    expect(mocks.settle).toHaveBeenCalledExactlyOnceWith({ reference: REF, transactionId: TRX });
    expect(
      admin.queries.some(
        (q) => q.table === "payment_events" && q.op === "update" && q.payload?.processed_at,
      ),
    ).toBe(true);
  });

  it("notification reçue deux fois : traitée une seule fois", async () => {
    mocks.admin = events({ processed: true });
    const response = await handlePaymentWebhook(provider, notification("payment.complete"));
    expect(await response.json()).toMatchObject({ received: true, duplicate: true });
    expect(mocks.settle).not.toHaveBeenCalled();
  });

  it("notification déjà reçue mais en échec la première fois : rejouée", async () => {
    mocks.admin = events({ processed: false });
    await handlePaymentWebhook(provider, notification("payment.complete"));
    expect(mocks.settle).toHaveBeenCalledOnce();
  });

  it("événements hors règlement (création, transferts…) : notés puis ignorés", async () => {
    for (const event of ["payment.created", "transfer.complete"]) {
      mocks.admin = events();
      const response = await handlePaymentWebhook(provider, notification(event));
      expect(await response.json()).toMatchObject({ received: true, ignored: true });
    }
    expect(mocks.settle).not.toHaveBeenCalled();
  });

  it("erreur pendant le traitement : 500, pour que Notch Pay renvoie la notification", async () => {
    mocks.admin = events();
    mocks.settle.mockRejectedValueOnce(new Error("base indisponible"));
    expect((await handlePaymentWebhook(provider, notification("payment.complete"))).status).toBe(
      500,
    );
  });
});

describe("règlement d'un paiement (settlePayment)", () => {
  let settlePayment: typeof import("@/lib/billing/service").settlePayment;

  beforeEach(async () => {
    vi.resetModules();
    vi.doUnmock("@/lib/billing/service");
    ({ settlePayment } = await import("@/lib/billing/service"));
  });

  const pending = {
    id: "pay-1",
    user_id: "user-1",
    provider: "notchpay",
    provider_ref: REF,
    provider_tx_id: TRX,
    amount: 5000,
    currency: "XAF",
    status: "pending",
    plan: "essential",
    billing_cycle: "monthly",
    kind: "new",
  };

  /** Base factice : le paiement attendu, et les mises à jour notées. */
  function db(row: Record<string, unknown> = pending) {
    return fakeAdmin((q) => {
      if (q.table === "payments" && q.op === "select") return { data: row, error: null };
      if (q.table === "payments" && q.op === "update")
        return { data: [{ id: row.id }], error: null };
      return { data: null, error: null };
    });
  }

  const verified = (over: Partial<VerifiedTransaction>): PaymentProvider =>
    ({
      name: "notchpay",
      verifyTransaction: vi.fn(async () => ({
        status: "successful",
        reference: REF,
        transactionId: TRX,
        amount: 5000,
        currency: "XAF",
        method: "cm.mtn",
        failureReason: null,
        ...over,
      })),
    }) as unknown as PaymentProvider;

  it("montant attendu et devise identique : abonnement activé (une fois)", async () => {
    const admin = db();
    mocks.admin = admin;
    mocks.provider = verified({});
    expect((await settlePayment({ reference: REF, transactionId: null })).outcome).toBe(
      "successful",
    );
    expect(admin.rpc).toHaveBeenCalledExactlyOnceWith("complete_payment", {
      p_payment_id: "pay-1",
      p_provider_tx_id: TRX,
      p_method: "cm.mtn",
    });
  });

  it("paiement déjà réglé : rien n'est réactivé ni prolongé", async () => {
    const admin = db({ ...pending, status: "successful" });
    mocks.admin = admin;
    mocks.provider = verified({});
    expect((await settlePayment({ reference: REF, transactionId: null })).outcome).toBe(
      "successful",
    );
    expect(admin.rpc).not.toHaveBeenCalled();
    expect(mocks.provider.verifyTransaction).not.toHaveBeenCalled();
  });

  it("montant inférieur au prix : refusé, aucun abonnement", async () => {
    const admin = db();
    mocks.admin = admin;
    mocks.provider = verified({ amount: 100 });
    expect((await settlePayment({ reference: REF, transactionId: null })).outcome).toBe("failed");
    expect(admin.rpc).not.toHaveBeenCalled();
    const update = admin.queries.find((q) => q.table === "payments" && q.op === "update");
    expect(update?.payload).toMatchObject({ status: "failed", failure_reason: "amount_mismatch" });
    // Jamais un paiement déjà réussi n'est repassé en échec.
    expect(update?.filters).toContainEqual(["neq", "status", "successful"]);
  });

  it("autre devise : refusé, aucun abonnement", async () => {
    const admin = db();
    mocks.admin = admin;
    mocks.provider = verified({ currency: "EUR" });
    expect((await settlePayment({ reference: REF, transactionId: null })).outcome).toBe("failed");
    expect(admin.rpc).not.toHaveBeenCalled();
  });

  it("transaction d'un autre paiement : ignorée", async () => {
    const admin = db();
    mocks.admin = admin;
    mocks.provider = verified({ reference: "00000000-0000-4000-8000-000000000000" });
    expect((await settlePayment({ reference: REF, transactionId: null })).outcome).toBe("unknown");
    expect(admin.rpc).not.toHaveBeenCalled();
  });

  it("encore en attente chez Notch Pay : rien ne change", async () => {
    const admin = db();
    mocks.admin = admin;
    mocks.provider = verified({ status: "pending" });
    expect((await settlePayment({ reference: REF, transactionId: null })).outcome).toBe("pending");
    expect(admin.rpc).not.toHaveBeenCalled();
    expect(admin.queries.some((q) => q.op === "update")).toBe(false);
  });

  it("refus de l'opérateur : paiement en échec avec sa cause", async () => {
    const admin = db();
    mocks.admin = admin;
    mocks.provider = verified({ status: "failed", failureReason: "failed" });
    expect((await settlePayment({ reference: REF, transactionId: null })).outcome).toBe("failed");
    const update = admin.queries.find((q) => q.table === "payments" && q.op === "update");
    expect(update?.payload).toMatchObject({ status: "failed", failure_reason: "failed" });
    expect(admin.rpc).not.toHaveBeenCalled();
  });

  it("référence inconnue : rien n'est activé", async () => {
    mocks.admin = fakeAdmin(() => ({ data: null, error: null }));
    mocks.provider = verified({});
    expect((await settlePayment({ reference: REF, transactionId: null })).outcome).toBe("unknown");
  });
});
