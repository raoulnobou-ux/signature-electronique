import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { Currency } from "@/lib/entitlements/plans";
import {
  PaymentProviderError,
  type CheckoutRequest,
  type PaymentProvider,
  type TransactionStatus,
  type VerifiedTransaction,
  type WebhookEvent,
} from "./provider";

const API = "https://api.flutterwave.com/v3";

/** Moyens proposés au checkout : Mobile Money d'Afrique centrale (MTN, Orange) + carte. */
export const PAYMENT_OPTIONS: Record<Currency, string> = {
  XAF: "mobilemoneyfranco,card",
  USD: "card",
};

type FlwTransaction = {
  id: number | string;
  tx_ref: string;
  amount: number;
  currency: string;
  status: string;
  payment_type?: string | null;
  processor_response?: string | null;
};

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function mapStatus(status: string | undefined): TransactionStatus {
  const s = (status ?? "").toLowerCase();
  if (s === "successful") return "successful";
  if (s === "failed" || s === "cancelled" || s === "canceled" || s === "error") return "failed";
  return "pending";
}

/**
 * Authentification d'un webhook Flutterwave :
 * - en-tête `flutterwave-signature` : HMAC-SHA256 (base64) du corps avec le « secret hash » ;
 * - sinon en-tête historique `verif-hash` : égal au « secret hash » configuré (ou à son SHA-256).
 * Dans tous les cas, la transaction est ensuite revérifiée par l'API avant toute activation.
 */
export function isAuthenticWebhook(headers: Headers, rawBody: string, secretHash: string): boolean {
  const signature = headers.get("flutterwave-signature");
  if (signature) {
    const expected = createHmac("sha256", secretHash).update(rawBody).digest("base64");
    return safeEqual(signature, expected);
  }
  const verif = headers.get("verif-hash");
  if (!verif) return false;
  return (
    safeEqual(verif, secretHash) ||
    safeEqual(verif, createHash("sha256").update(secretHash).digest("hex"))
  );
}

export class FlutterwaveProvider implements PaymentProvider {
  readonly name = "flutterwave";

  constructor(
    private readonly secretKey: string,
    private readonly webhookHash: string | undefined,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await this.fetcher(`${API}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        "Content-Type": "application/json",
        ...init?.headers,
      },
      signal: AbortSignal.timeout(20_000),
    });
    const body = (await response.json().catch(() => null)) as
      | { status?: string; message?: string; data?: T }
      | null;
    if (!response.ok || body?.status !== "success" || !body.data) {
      throw new PaymentProviderError(`Flutterwave ${response.status}: ${body?.message ?? "réponse invalide"}`, body);
    }
    return body.data;
  }

  async createCheckout(req: CheckoutRequest): Promise<{ url: string }> {
    const data = await this.request<{ link: string }>("/payments", {
      method: "POST",
      body: JSON.stringify({
        tx_ref: req.reference,
        amount: req.amount,
        currency: req.currency,
        redirect_url: req.redirectUrl,
        payment_options: PAYMENT_OPTIONS[req.currency],
        customer: {
          email: req.customer.email,
          name: req.customer.name || req.customer.email,
          ...(req.customer.phone ? { phonenumber: req.customer.phone } : {}),
        },
        customizations: { title: "QuickSign", description: req.description },
        meta: req.meta,
      }),
    });
    if (!/^https:\/\//.test(data.link)) throw new PaymentProviderError("Lien de paiement invalide");
    return { url: data.link };
  }

  async verifyTransaction({
    reference,
    transactionId,
  }: {
    reference: string;
    transactionId: string | null;
    expected?: unknown;
  }): Promise<VerifiedTransaction | null> {
    let tx: FlwTransaction;
    try {
      tx =
        transactionId && /^\d+$/.test(transactionId)
          ? await this.request<FlwTransaction>(`/transactions/${transactionId}/verify`)
          : await this.request<FlwTransaction>(
              `/transactions/verify_by_reference?tx_ref=${encodeURIComponent(reference)}`,
            );
    } catch (error) {
      // Transaction inconnue (paiement abandonné avant l'opérateur) : rien à valider.
      if (error instanceof PaymentProviderError) {
        console.warn("[flutterwave] vérification impossible", error.message);
        return null;
      }
      throw error;
    }
    const status = mapStatus(tx.status);
    return {
      status,
      reference: tx.tx_ref,
      transactionId: String(tx.id),
      amount: Number(tx.amount),
      currency: tx.currency,
      method: tx.payment_type ?? null,
      failureReason: status === "failed" ? (tx.processor_response ?? null) : null,
    };
  }

  parseWebhook(headers: Headers, rawBody: string): WebhookEvent | null {
    if (!this.webhookHash || !isAuthenticWebhook(headers, rawBody, this.webhookHash)) return null;
    let payload: { event?: string; type?: string; data?: Partial<FlwTransaction> };
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return null;
    }
    const data = payload.data ?? {};
    const type = payload.event ?? payload.type ?? "unknown";
    const id = data.id != null ? String(data.id) : null;
    return {
      key: `${type}:${id ?? data.tx_ref ?? "?"}:${data.status ?? ""}`,
      type,
      reference: data.tx_ref ?? null,
      transactionId: id,
      payload,
    };
  }
}
