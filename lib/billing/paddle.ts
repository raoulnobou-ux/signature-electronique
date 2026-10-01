import "server-only";
import { createHmac } from "node:crypto";
import {
  PaymentProviderError,
  type CheckoutRequest,
  type PaymentProvider,
  type TransactionStatus,
  type VerifiedTransaction,
  type WebhookEvent,
} from "./provider";
import { safeEqual } from "./util";

/**
 * Paddle Billing : paiements internationaux (carte, PayPal, Apple Pay, Google Pay) en
 * dollars. Paddle est revendeur officiel (Merchant of Record) : il calcule et reverse la
 * TVA du pays de l'acheteur. Une transaction est créée côté serveur ; le client paie dans
 * le formulaire Paddle ouvert sur une page de QuickSign (Paddle.js), puis la transaction
 * est revérifiée par l'API (GET /transactions/{id}).
 */
export const PADDLE_API = {
  sandbox: "https://sandbox-api.paddle.com",
  production: "https://api.paddle.com",
} as const;

export type PaddleEnvironment = keyof typeof PADDLE_API;

/** Fenêtre d'acceptation de l'horodatage d'une notification (rejeu). */
const WEBHOOK_TOLERANCE_SECONDS = 300;

/** Statut d'une transaction Paddle → statut interne. */
export function mapTransactionStatus(status: string | undefined): TransactionStatus {
  if (status === "completed" || status === "paid") return "successful";
  if (status === "canceled") return "failed";
  // draft, ready, billed, past_due : paiement pas encore effectué.
  return "pending";
}

/** Montant en unités monétaires (« 999 » centimes → 9,99). */
export function fromMinorUnits(amount: string | undefined, currency: string): number {
  const value = Number(amount ?? Number.NaN);
  return currency === "JPY" || currency === "KRW" ? value : value / 100;
}

/**
 * En-tête `Paddle-Signature` : « ts=…;h1=… », HMAC-SHA256 (hex) de « ts:corps brut » avec
 * la clé secrète de la destination de notification.
 */
export function verifyPaddleSignature(
  header: string | null,
  rawBody: string,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): boolean {
  if (!header) return false;
  const parts = Object.fromEntries(
    header.split(";").map((part) => {
      const index = part.indexOf("=");
      return [part.slice(0, index).trim(), part.slice(index + 1).trim()];
    }),
  );
  const ts = Number(parts.ts);
  const h1 = parts.h1;
  if (!Number.isFinite(ts) || !h1) return false;
  if (Math.abs(nowSeconds - ts) > WEBHOOK_TOLERANCE_SECONDS) return false;
  const expected = createHmac("sha256", secret).update(`${ts}:${rawBody}`).digest("hex");
  return safeEqual(expected, h1.toLowerCase());
}

type PaddleTransaction = {
  id?: string;
  status?: string;
  currency_code?: string;
  custom_data?: Record<string, unknown> | null;
  checkout?: { url?: string | null } | null;
  details?: { totals?: { grand_total?: string; total?: string } | null } | null;
  payments?: { status?: string; method_details?: { type?: string } | null }[] | null;
};

export class PaddleProvider implements PaymentProvider {
  readonly name = "paddle";
  private readonly base: string;

  constructor(
    private readonly apiKey: string,
    environment: PaddleEnvironment,
    private readonly webhookSecret: string | undefined,
    private readonly fetcher: typeof fetch = fetch,
  ) {
    this.base = PADDLE_API[environment];
  }

  private async request(path: string, init: { method: "GET" | "POST"; body?: unknown }) {
    const response = await this.fetcher(`${this.base}${path}`, {
      method: init.method,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        Accept: "application/json",
        ...(init.body ? { "Content-Type": "application/json" } : {}),
      },
      body: init.body ? JSON.stringify(init.body) : undefined,
      signal: AbortSignal.timeout(20_000),
    });
    const body = (await response.json().catch(() => null)) as {
      data?: PaddleTransaction;
      error?: { code?: string; detail?: string };
    } | null;
    return { status: response.status, body };
  }

  async createCheckout(req: CheckoutRequest): Promise<{ url: string; transactionId: string }> {
    if (!req.checkoutPageUrl) {
      throw new PaymentProviderError("Paddle : page de paiement manquante");
    }
    const { status, body } = await this.request("/transactions", {
      method: "POST",
      body: {
        items: [
          {
            quantity: 1,
            price: {
              description: req.description,
              name: req.description,
              unit_price: {
                amount: String(Math.round(req.amount * 100)),
                currency_code: req.currency,
              },
              product: { name: req.productName, tax_category: "standard" },
            },
          },
        ],
        currency_code: req.currency,
        collection_mode: "automatic",
        custom_data: { reference: req.reference, ...req.meta },
        checkout: { url: req.checkoutPageUrl },
      },
    });
    const transaction = body?.data;
    const url = transaction?.checkout?.url;
    if (status >= 300 || !transaction?.id || !url || !/^https?:\/\//.test(url)) {
      throw new PaymentProviderError(
        `Paddle ${status}: ${body?.error?.code ?? "réponse invalide"}${
          body?.error?.detail ? ` — ${body.error.detail}` : ""
        }`,
        body,
      );
    }
    return { url, transactionId: transaction.id };
  }

  async verifyTransaction({
    reference,
    transactionId,
  }: {
    reference: string;
    transactionId: string | null;
  }): Promise<VerifiedTransaction | null> {
    if (!transactionId || !/^txn_[a-z0-9]+$/i.test(transactionId)) return null;
    const { status, body } = await this.request(`/transactions/${transactionId}`, {
      method: "GET",
    });
    const tx = body?.data;
    if (status >= 300 || !tx?.status) return null;
    // La transaction doit être celle de ce paiement (référence posée à la création).
    if (tx.custom_data?.reference !== reference) return null;
    const result = mapTransactionStatus(tx.status);
    const currency = tx.currency_code ?? "";
    const paid = tx.payments?.find((p) => p.status === "captured") ?? tx.payments?.[0];
    return {
      status: result,
      reference,
      transactionId: tx.id ?? transactionId,
      amount: fromMinorUnits(
        tx.details?.totals?.grand_total ?? tx.details?.totals?.total,
        currency,
      ),
      currency,
      method: paid?.method_details?.type ?? null,
      failureReason: result === "failed" ? tx.status : null,
    };
  }

  /** Notification Paddle authentifiée par `Paddle-Signature`, puis revérifiée par l'API. */
  parseWebhook(headers: Headers, rawBody: string): WebhookEvent | null {
    if (!this.webhookSecret) return null;
    if (!verifyPaddleSignature(headers.get("paddle-signature"), rawBody, this.webhookSecret)) {
      return null;
    }
    let payload: { event_id?: string; event_type?: string; data?: PaddleTransaction };
    try {
      payload = JSON.parse(rawBody) as typeof payload;
    } catch {
      return null;
    }
    if (!payload.event_id || !payload.event_type) return null;
    const isTransaction = payload.event_type.startsWith("transaction.");
    const reference = payload.data?.custom_data?.reference;
    return {
      key: payload.event_id,
      type: payload.event_type,
      reference: isTransaction && typeof reference === "string" ? reference : null,
      transactionId: isTransaction ? (payload.data?.id ?? null) : null,
      payload,
    };
  }
}
