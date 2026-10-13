import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { logAppError } from "@/lib/monitoring/app-errors";
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

/**
 * Statut d'une transaction Notch Pay → statut interne. Statuts finaux d'échec relevés dans
 * la documentation (Payments API et page « Collect ») ; « partialy-refunded » y est écrit
 * ainsi, l'orthographe correcte est acceptée aussi.
 */
const FAILED_STATUSES = new Set([
  "failed",
  "rejected",
  "canceled",
  "cancelled",
  "abandoned",
  "expired",
  "refunded",
  "partialy-refunded",
  "partially-refunded",
]);

export function mapNotchPayStatus(status: string | undefined): TransactionStatus {
  const s = (status ?? "").toLowerCase();
  if (s === "complete") return "successful";
  if (FAILED_STATUSES.has(s)) return "failed";
  // pending, processing, hold, incomplete : encore en cours.
  return "pending";
}

/**
 * Événements Notch Pay traités : ceux de la catégorie « Paiements » qui changent l'issue
 * d'un paiement. payment.created et les autres catégories (transferts, clients…) sont
 * notés puis ignorés.
 */
const SETTLING_EVENTS = new Set([
  "payment.complete",
  "payment.failed",
  "payment.canceled",
  "payment.cancelled",
  "payment.expired",
  "payment.abandoned",
]);

/** Canal de paiement actif sur le compte Notch Pay (GET /channels). */
export type NotchPayChannel = {
  /** Identifiant Notch Pay : cm.mtn, cm.orange, card… */
  id: string;
  /** Nom affiché par Notch Pay : « MTN Mobile Money », « Orange Money »… */
  name: string;
  /** mobile, card, wallet… */
  type: string;
};

type ChannelItem = {
  id?: unknown;
  name?: unknown;
  type?: unknown;
  active?: unknown;
  live?: unknown;
  currency?: unknown;
};

/**
 * Canaux utilisables : actifs sur le compte et, avec une clé de production, ouverts en
 * production (« live »). En test, un canal actif suffit.
 */
export function usableChannels(items: unknown, testMode: boolean): NotchPayChannel[] {
  if (!Array.isArray(items)) return [];
  const channels: NotchPayChannel[] = [];
  for (const item of items as ChannelItem[]) {
    if (item?.active !== true || (!testMode && item.live !== true)) continue;
    if (item.currency !== undefined && item.currency !== "XAF") continue;
    if (typeof item.id !== "string" || typeof item.name !== "string") continue;
    channels.push({
      id: item.id.slice(0, 40),
      name: item.name.slice(0, 60),
      type: typeof item.type === "string" ? item.type.slice(0, 20) : "other",
    });
  }
  return channels;
}

const CHANNELS_TTL_MS = 10 * 60_000;

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

/**
 * Moyen de paiement lisible pour le reçu : le canal (cm.mtn, cm.orange, card…) ; un
 * identifiant interne (« pm.… ») n'est pas montré, « notchpay » le remplace.
 */
export function notchPayMethod(tx: { payment_method?: string | null; channel?: string | null }) {
  for (const value of [tx.channel, tx.payment_method]) {
    if (typeof value === "string" && value && !/^pm[._]/i.test(value)) return value.slice(0, 60);
  }
  return "notchpay";
}

/** Champs utiles au diagnostic d'un échec ; jamais le client, son numéro ni sa carte. */
const DETAIL_KEYS =
  /^(status|message|reason|failure|error|code|channel|provider|description_status|status_message|failure_reason|failure_message)$/i;
const PERSONAL_KEYS = /customer|phone|email|name|card|number|account|pan|msisdn/i;

/**
 * Cause d'un échec telle que décrite par Notch Pay (transaction et opération « charge »),
 * sans aucune donnée personnelle, pour le journal des erreurs.
 */
export function notchPayFailureDetail(tx: unknown): string {
  const parts: string[] = [];
  const visit = (value: unknown, path: string, depth: number) => {
    if (!value || typeof value !== "object" || depth > 2) return;
    for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
      if (PERSONAL_KEYS.test(key)) continue;
      const here = path ? `${path}.${key}` : key;
      if ((typeof v === "string" || typeof v === "number") && DETAIL_KEYS.test(key)) {
        parts.push(
          `${here}=${String(v)
            .replace(/\+?\d{8,}/g, "[numéro]")
            .slice(0, 120)}`,
        );
      } else if (typeof v === "object") {
        visit(v, here, depth + 1);
      }
    }
  };
  visit(tx, "", 0);
  return parts.join(" ; ").slice(0, 900) || "aucun détail";
}

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

  private channelsCache: { at: number; value: NotchPayChannel[] } | null = null;

  /**
   * Canaux réellement disponibles sur le compte (GET /channels, mis en cache 10 minutes).
   * La documentation indique GET /resources/channels avec une liste « channels » ; l'API
   * répond en réalité sur /channels avec une liste « items » (vérifié le 13 octobre 2026).
   * null si Notch Pay ne répond pas : l'interface reste alors générique.
   */
  async listChannels(): Promise<NotchPayChannel[] | null> {
    if (this.channelsCache && Date.now() - this.channelsCache.at < CHANNELS_TTL_MS) {
      return this.channelsCache.value;
    }
    try {
      // Délai court : la liste sert à l'affichage des pages Tarifs et Abonnement.
      const { status, body } = await this.request("/channels?currency=XAF", {
        method: "GET",
        timeoutMs: 4_000,
      });
      if (status >= 300 || !Array.isArray(body?.items)) {
        await logAppError("billing.notchpay_channels", `HTTP ${status}`);
        return null;
      }
      const value = usableChannels(body.items, this.testMode);
      this.channelsCache = { at: Date.now(), value };
      return value;
    } catch (error) {
      await logAppError("billing.notchpay_channels", error);
      return null;
    }
  }

  private async request(
    path: string,
    init: { method: "GET" | "POST"; body?: unknown; timeoutMs?: number },
  ) {
    const response = await this.fetcher(`${NOTCHPAY_API}${path}`, {
      method: init.method,
      headers: {
        Authorization: this.publicKey,
        Accept: "application/json",
        ...(init.body ? { "Content-Type": "application/json" } : {}),
      },
      body: init.body ? JSON.stringify(init.body) : undefined,
      signal: AbortSignal.timeout(init.timeoutMs ?? 20_000),
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
    if (result === "failed" && !sandboxWithLiveKey) {
      await logAppError("billing.notchpay_failed", notchPayFailureDetail(body?.transaction), {
        code: tx.reference ?? id,
      });
    }
    return {
      status: result,
      reference,
      transactionId: tx.reference ?? id,
      amount: Number(tx.amount),
      currency: tx.currency ?? "",
      method: notchPayMethod(tx),
      failureReason: sandboxWithLiveKey
        ? "sandbox_transaction"
        : result === "failed"
          ? (tx.status ?? "failed")
          : null,
    };
  }

  /**
   * Notification de Notch Pay. La signature (HMAC-SHA256 du corps brut avec la clé de
   * hachage, en-tête x-notch-signature) est toujours exigée : sans clé configurée, toute
   * notification est refusée (le retour du client et la tâche planifiée prennent le relais).
   * Le contenu n'est jamais cru : seule la référence sert, et la transaction est revérifiée
   * par l'API avant toute activation. Les événements hors paiement sont rendus sans
   * référence, donc notés puis ignorés.
   */
  parseWebhook(headers: Headers, rawBody: string): WebhookEvent | null {
    if (!this.webhookSecret) return null;
    const signature = headers.get("x-notch-signature") ?? headers.get("x-noth-signature");
    if (!verifyNotchPaySignature(signature, rawBody, this.webhookSecret)) return null;
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
    const settles = SETTLING_EVENTS.has(type.toLowerCase());
    return {
      key: id ?? `${merchantRef ?? txRef}:${type}:${status}`,
      type,
      reference: settles ? merchantRef : null,
      transactionId: settles ? txRef : null,
      payload,
    };
  }
}
