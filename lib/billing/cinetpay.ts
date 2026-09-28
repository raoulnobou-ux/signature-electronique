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

const API = "https://api-checkout.cinetpay.com/v2";

/** Canaux proposés : Mobile Money (MTN, Orange) + carte en FCFA ; carte seule en dollars. */
export const CHANNELS: Record<Currency, string> = { XAF: "ALL", USD: "CREDIT_CARD" };

/**
 * Champs de la notification, dans l'ordre de concaténation du jeton HMAC `x-token`
 * (documentation CinetPay « Préparez une page de notification »).
 */
export const NOTIFICATION_FIELDS = [
  "cpm_site_id",
  "cpm_trans_id",
  "cpm_trans_date",
  "cpm_amount",
  "cpm_currency",
  "signature",
  "payment_method",
  "cel_phone_num",
  "cpm_phone_prefixe",
  "cpm_language",
  "cpm_version",
  "cpm_payment_config",
  "cpm_page_action",
  "cpm_custom",
  "cpm_designation",
  "cpm_error_message",
] as const;

type CheckData = {
  amount?: string | number;
  currency?: string;
  status?: string;
  payment_method?: string | null;
  operator_id?: string | null;
  description?: string | null;
};

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Statut CinetPay → statut interne. */
export function mapStatus(status: string | undefined): TransactionStatus {
  const s = (status ?? "").toUpperCase();
  if (s === "ACCEPTED") return "successful";
  if (s === "REFUSED" || s === "CANCELED" || s === "CANCELLED" || s === "EXPIRED") return "failed";
  return "pending";
}

/** Décode le corps d'une notification (formulaire, ou JSON par sécurité). */
export function parseNotificationBody(rawBody: string): Record<string, string> {
  const trimmed = rawBody.trim();
  if (trimmed.startsWith("{")) {
    try {
      const json = JSON.parse(trimmed) as Record<string, unknown>;
      return Object.fromEntries(Object.entries(json).map(([k, v]) => [k, v == null ? "" : String(v)]));
    } catch {
      return {};
    }
  }
  return Object.fromEntries(new URLSearchParams(trimmed));
}

/** Jeton attendu : HMAC-SHA256 (hex) de la concaténation des champs, avec la clé secrète. */
export function notificationToken(fields: Record<string, string>, secretKey: string): string {
  const data = NOTIFICATION_FIELDS.map((name) => fields[name] ?? "").join("");
  return createHmac("sha256", secretKey).update(data).digest("hex");
}

export class CinetPayProvider implements PaymentProvider {
  readonly name = "cinetpay";

  constructor(
    private readonly apiKey: string,
    private readonly siteId: string,
    private readonly secretKey: string | undefined,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  private async post<T>(path: string, payload: Record<string, unknown>) {
    const response = await this.fetcher(`${API}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ apikey: this.apiKey, site_id: this.siteId, ...payload }),
      signal: AbortSignal.timeout(20_000),
    });
    const body = (await response.json().catch(() => null)) as { code?: string; message?: string; data?: T } | null;
    return { status: response.status, body };
  }

  async createCheckout(req: CheckoutRequest): Promise<{ url: string }> {
    const [firstName, ...rest] = (req.customer.name || req.customer.email).trim().split(/\s+/);
    const { status, body } = await this.post<{ payment_url?: string; payment_token?: string }>("/payment", {
      transaction_id: req.reference,
      amount: req.amount,
      currency: req.currency,
      description: req.description,
      notify_url: req.notifyUrl,
      return_url: req.redirectUrl,
      channels: CHANNELS[req.currency],
      lang: "fr",
      metadata: JSON.stringify(req.meta),
      // Informations client (obligatoires pour le paiement par carte).
      customer_id: req.meta.user_id ?? "",
      customer_name: firstName ?? "",
      customer_surname: rest.join(" ") || (firstName ?? ""),
      customer_email: req.customer.email,
      customer_phone_number: req.customer.phone ?? "",
      customer_address: req.customer.city ?? "Douala",
      customer_city: req.customer.city ?? "Douala",
      customer_country: "CM",
      customer_state: "CM",
      customer_zip_code: "00000",
    });
    const url = body?.data?.payment_url;
    if (body?.code !== "201" || !url || !/^https:\/\//.test(url)) {
      throw new PaymentProviderError(`CinetPay ${status}: ${body?.message ?? "réponse invalide"}`, body);
    }
    return { url };
  }

  async verifyTransaction({ reference }: { reference: string; transactionId: string | null; expected?: unknown }): Promise<VerifiedTransaction | null> {
    const { body } = await this.post<CheckData>("/payment/check", { transaction_id: reference });
    const data = body?.data;
    if (!data?.status) {
      // Transaction inconnue (checkout jamais ouvert, ou réponse illisible).
      console.warn("[cinetpay] vérification impossible", body?.code, body?.message);
      return null;
    }
    const status = mapStatus(data.status);
    return {
      status,
      reference,
      transactionId: data.operator_id || reference,
      amount: Number(data.amount),
      currency: data.currency ?? "",
      method: data.payment_method ?? null,
      failureReason: status === "failed" ? (body?.message ?? data.status) : null,
    };
  }

  parseWebhook(headers: Headers, rawBody: string): WebhookEvent | null {
    if (!this.secretKey) return null;
    const token = headers.get("x-token");
    if (!token) return null;
    const fields = parseNotificationBody(rawBody);
    if (!safeEqual(token.toLowerCase(), notificationToken(fields, this.secretKey))) return null;
    if (fields.cpm_site_id && fields.cpm_site_id !== this.siteId) return null;
    const reference = fields.cpm_trans_id || null;
    return {
      // CinetPay peut notifier plusieurs fois (en attente, puis accepté) : clé = contenu exact.
      key: `notify:${reference ?? "?"}:${createHash("sha256").update(rawBody).digest("hex").slice(0, 24)}`,
      type: "payment.notification",
      reference,
      transactionId: reference,
      payload: fields,
    };
  }
}
