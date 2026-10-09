import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import {
  PaymentProviderError,
  type CheckoutRequest,
  type PaymentProvider,
  type TransactionStatus,
  type VerifiedTransaction,
  type WebhookEvent,
} from "../types";

/**
 * Notch Pay : Mobile Money (MTN, Orange) et carte bancaire, en FCFA. Le client paie sur la
 * page hébergée par Notch Pay (authorization_url) ; le résultat est toujours revérifié par
 * l'API (GET /payments/{référence}) avant toute activation.
 */
export const NOTCHPAY_API = "https://api.notchpay.co";

/** Clé publique de test (« pk_test.… ») : aucun argent réel. */
export function isNotchPayTestKey(key: string): boolean {
  return key.startsWith("pk_test.");
}

/** Statut d'une transaction Notch Pay → statut interne. */
export function mapNotchPayStatus(status: string | undefined): TransactionStatus {
  const s = (status ?? "").toLowerCase();
  if (s === "complete") return "successful";
  if (
    ["failed", "rejected", "canceled", "cancelled", "abandoned", "expired", "refunded"].includes(s)
  )
    return "failed";
  // pending, processing, hold, incomplete : encore en cours.
  return "pending";
}

/** Notre référence (payments.provider_ref) : UUID v4. */
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
/** Référence de transaction Notch Pay (« trx.… »). */
const NOTCHPAY_REF = /^[A-Za-z0-9._-]{4,120}$/;

/**
 * Signature d'une notification : HMAC-SHA256 (hexadécimal) du corps brut avec la clé de
 * hachage du webhook, comparée en temps constant.
 */
export function verifyNotchPaySignature(
  signature: string | null,
  rawBody: string,
  secret: string,
): boolean {
  if (!signature || !/^[0-9a-f]{64}$/i.test(signature)) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(signature.toLowerCase(), "hex"));
}

type Transaction = {
  reference?: string;
  merchant_reference?: string | null;
  status?: string;
  amount?: number | string;
  currency?: string;
  /** Transaction de test : true, 1 ou « 1 » selon les réponses de Notch Pay. */
  sandbox?: boolean | number | string;
  payment_method?: string | null;
  channel?: string | null;
};

export class NotchPayProvider implements PaymentProvider {
  readonly name = "notchpay";
  readonly method = "mobile_money" as const;
  /** Prix en FCFA ; la page Notch Pay accepte aussi la carte bancaire. */
  readonly currencies = ["XAF"] as const;

  constructor(
    private readonly publicKey: string,
    /** Clé de hachage des webhooks (tableau de bord → Webhooks) ; facultative. */
    private readonly webhookSecret?: string,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  get testMode(): boolean {
    return isNotchPayTestKey(this.publicKey);
  }

  private async request(path: string, init: { method: "GET" | "POST"; body?: unknown }) {
    const response = await this.fetcher(`${NOTCHPAY_API}${path}`, {
      method: init.method,
      headers: {
        Authorization: this.publicKey,
        Accept: "application/json",
        ...(init.body ? { "Content-Type": "application/json" } : {}),
      },
      body: init.body ? JSON.stringify(init.body) : undefined,
      signal: AbortSignal.timeout(20_000),
    });
    const body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
    return { status: response.status, body };
  }

  async createCheckout(req: CheckoutRequest): Promise<{ url: string; transactionId?: string }> {
    if (!UUID_V4.test(req.reference)) {
      throw new PaymentProviderError("Notch Pay : la référence doit être un UUID v4");
    }
    const payload = {
      amount: Math.round(req.amount),
      currency: req.currency,
      email: req.customer.email,
      name: req.customer.name || undefined,
      phone: req.customer.phone || undefined,
      reference: req.reference,
      callback: req.redirectUrl,
      description: req.description.slice(0, 250),
      locale: req.language,
    };
    let result = await this.request("/payments", { method: "POST", body: payload });
    // Ancienne route d'initialisation, encore utilisée par certains comptes.
    if (result.status === 404 || result.status === 405) {
      result = await this.request("/payments/initialize", { method: "POST", body: payload });
    }
    const { status, body } = result;
    const url = typeof body?.authorization_url === "string" ? body.authorization_url : null;
    const transaction = body?.transaction as Transaction | undefined;
    if (status >= 300 || !url || !/^https:\/\//.test(url)) {
      throw new PaymentProviderError(
        `Notch Pay ${status}: ${typeof body?.message === "string" ? body.message : "réponse invalide"}`,
        body,
      );
    }
    const transactionId =
      transaction?.reference && NOTCHPAY_REF.test(transaction.reference)
        ? transaction.reference
        : undefined;
    return { url, transactionId };
  }

  /**
   * Revérifie la transaction (par l'identifiant Notch Pay noté à la création, sinon par
   * notre référence). Elle doit porter notre référence : une autre transaction réussie
   * ne peut pas servir à activer ce paiement.
   */
  async verifyTransaction({
    reference,
    transactionId,
  }: {
    reference: string;
    transactionId: string | null;
  }): Promise<VerifiedTransaction | null> {
    const id = transactionId && NOTCHPAY_REF.test(transactionId) ? transactionId : reference;
    if (!NOTCHPAY_REF.test(id)) return null;
    const { status, body } = await this.request(`/payments/${encodeURIComponent(id)}`, {
      method: "GET",
    });
    const tx = body?.transaction as Transaction | undefined;
    if (status >= 300 || !tx?.status) return null;
    const merchantReference = tx.merchant_reference ?? null;
    if (merchantReference !== reference) {
      return {
        status: "failed",
        reference: merchantReference ?? "",
        transactionId: tx.reference ?? id,
        amount: 0,
        currency: "",
        method: null,
        failureReason: "reference_mismatch",
      };
    }
    let result = mapNotchPayStatus(tx.status);
    // Une transaction de test ne vaut jamais paiement avec une clé de production.
    const sandbox =
      tx.sandbox === true || tx.sandbox === 1 || tx.sandbox === "1" || tx.sandbox === "true";
    const sandboxWithLiveKey = sandbox && !this.testMode;
    if (sandboxWithLiveKey) result = "failed";
    return {
      status: result,
      reference,
      transactionId: tx.reference ?? id,
      amount: Number(tx.amount),
      currency: tx.currency ?? "",
      method: tx.payment_method ?? tx.channel ?? null,
      failureReason: sandboxWithLiveKey
        ? "sandbox_transaction"
        : result === "failed"
          ? (tx.status ?? "failed")
          : null,
    };
  }

  /**
   * Notification de Notch Pay. Avec une clé de hachage configurée, la signature est exigée.
   * Dans tous les cas le contenu n'est jamais cru : seule la référence sert, et la
   * transaction est revérifiée par l'API avant toute activation.
   */
  parseWebhook(headers: Headers, rawBody: string): WebhookEvent | null {
    if (this.webhookSecret) {
      const signature = headers.get("x-notch-signature") ?? headers.get("x-noth-signature");
      if (!verifyNotchPaySignature(signature, rawBody, this.webhookSecret)) return null;
    }
    let payload: { id?: unknown; event?: unknown; type?: unknown; data?: Transaction };
    try {
      payload = JSON.parse(rawBody) as typeof payload;
    } catch {
      return null;
    }
    const data = payload?.data ?? {};
    const merchantRef =
      typeof data.merchant_reference === "string" && UUID_V4.test(data.merchant_reference)
        ? data.merchant_reference
        : null;
    const txRef =
      typeof data.reference === "string" && NOTCHPAY_REF.test(data.reference)
        ? data.reference
        : null;
    if (!merchantRef && !txRef) return null;
    const type = String(payload.event ?? payload.type ?? "unknown").slice(0, 60);
    const status = String(data.status ?? "").slice(0, 40);
    const id = typeof payload.id === "string" ? payload.id.slice(0, 120) : null;
    return {
      key: id ?? `${merchantRef ?? txRef}:${type}:${status}`,
      type,
      reference: merchantRef,
      transactionId: txRef,
      payload,
    };
  }
}
