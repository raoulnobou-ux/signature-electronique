import "server-only";
import {
  PaymentProviderError,
  type CheckoutRequest,
  type PaymentProvider,
  type TransactionStatus,
  type VerifiedTransaction,
  type WebhookEvent,
} from "./provider";

/**
 * pawaPay (API v2) : Mobile Money en Afrique (MTN, Orange, Airtel…), pour les paiements
 * en FCFA. Le client paie sur la page de paiement hébergée par pawaPay (Payment Page) ;
 * le résultat est toujours revérifié par l'API (GET /v2/deposits/{depositId}).
 */
export const PAWAPAY_API = {
  sandbox: "https://api.sandbox.pawapay.io",
  production: "https://api.pawapay.io",
} as const;

export type PawaPayEnvironment = keyof typeof PAWAPAY_API;

/** Identifiant de dépôt exigé par pawaPay : UUID version 4. */
export const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Statut d'un dépôt pawaPay → statut interne. */
export function mapDepositStatus(status: string | undefined): TransactionStatus {
  const s = (status ?? "").toUpperCase();
  if (s === "COMPLETED") return "successful";
  if (s === "FAILED") return "failed";
  // ACCEPTED, SUBMITTED, ENQUEUED, PROCESSING, IN_RECONCILIATION : encore en cours.
  return "pending";
}

/**
 * Message affiché par l'opérateur au client (relevé Mobile Money) : 4 à 22 caractères,
 * lettres, chiffres et espaces uniquement.
 */
export function customerMessage(text: string): string {
  const clean = text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 22)
    .trim();
  return clean.length >= 4 ? clean : "QuickSign";
}

/** Pays de la zone FCFA (CEMAC) servis par pawaPay : indicatif → code ISO alpha-3. */
const XAF_COUNTRIES: Record<string, string> = {
  "237": "CMR",
  "241": "GAB",
  "242": "COG",
  "235": "TCD",
  "236": "CAF",
  "240": "GNQ",
};

/**
 * Pays et numéro transmis à pawaPay (l'un des deux est obligatoire avec le montant) :
 * le pays du numéro s'il est dans la zone FCFA, sinon le Cameroun sans numéro (le client
 * saisit alors son numéro sur la page pawaPay).
 */
export function payerCountry(phone: string | null | undefined): {
  country: string;
  phoneNumber?: string;
} {
  const digits = (phone ?? "").replace(/\D/g, "");
  const country = XAF_COUNTRIES[digits.slice(0, 3)];
  return country && digits.length >= 11 ? { country, phoneNumber: digits } : { country: "CMR" };
}

type Deposit = {
  depositId?: string;
  status?: string;
  amount?: string | number;
  currency?: string;
  providerTransactionId?: string | null;
  payer?: { accountDetails?: { provider?: string | null } | null } | null;
  failureReason?: { failureCode?: string; failureMessage?: string } | null;
};

export class PawaPayProvider implements PaymentProvider {
  readonly name = "pawapay";
  private readonly base: string;

  constructor(
    private readonly token: string,
    environment: PawaPayEnvironment,
    private readonly fetcher: typeof fetch = fetch,
  ) {
    this.base = PAWAPAY_API[environment];
  }

  private async request(path: string, init: { method: "GET" | "POST"; body?: unknown }) {
    const response = await this.fetcher(`${this.base}${path}`, {
      method: init.method,
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: "application/json",
        ...(init.body ? { "Content-Type": "application/json" } : {}),
      },
      body: init.body ? JSON.stringify(init.body) : undefined,
      signal: AbortSignal.timeout(20_000),
    });
    const body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
    return { status: response.status, body };
  }

  async createCheckout(req: CheckoutRequest): Promise<{ url: string }> {
    if (!UUID_V4.test(req.reference)) {
      throw new PaymentProviderError("pawaPay : la référence doit être un UUID v4");
    }
    const { status, body } = await this.request("/v2/paymentpage", {
      method: "POST",
      body: {
        depositId: req.reference,
        returnUrl: req.redirectUrl,
        customerMessage: customerMessage(`QuickSign ${req.description}`),
        amountDetails: { amount: String(Math.round(req.amount)), currency: req.currency },
        ...payerCountry(req.customer.phone),
        language: req.language === "en" ? "EN" : "FR",
        reason: req.description.slice(0, 50),
        metadata: Object.entries(req.meta).map(([key, value]) => ({ [key]: value })),
      },
    });
    const url = typeof body?.redirectUrl === "string" ? body.redirectUrl : null;
    if (status >= 300 || !url || !/^https:\/\//.test(url)) {
      const failure = body?.failureReason as Deposit["failureReason"];
      throw new PaymentProviderError(
        `pawaPay ${status}: ${failure?.failureCode ?? body?.status ?? "réponse invalide"}${
          failure?.failureMessage ? ` — ${failure.failureMessage}` : ""
        }`,
        body,
      );
    }
    return { url };
  }

  async verifyTransaction({
    reference,
  }: {
    reference: string;
    transactionId: string | null;
  }): Promise<VerifiedTransaction | null> {
    if (!UUID_V4.test(reference)) return null;
    const { status, body } = await this.request(`/v2/deposits/${reference}`, { method: "GET" });
    // NOT_FOUND : le client n'a pas encore validé le paiement sur la page pawaPay.
    const data = body?.status === "FOUND" ? (body.data as Deposit | undefined) : undefined;
    if (status >= 300 || !data?.status) return null;
    const result = mapDepositStatus(data.status);
    return {
      status: result,
      reference,
      transactionId: data.providerTransactionId || reference,
      amount: Number(data.amount),
      currency: data.currency ?? "",
      method: data.payer?.accountDetails?.provider ?? null,
      failureReason:
        result === "failed"
          ? (data.failureReason?.failureMessage ?? data.failureReason?.failureCode ?? data.status)
          : null,
    };
  }

  /**
   * Notification de pawaPay (callback de dépôt). Son contenu n'est jamais cru : seule la
   * référence sert, et la transaction est revérifiée par l'API avant toute activation.
   */
  parseWebhook(_headers: Headers, rawBody: string): WebhookEvent | null {
    let payload: Deposit;
    try {
      payload = JSON.parse(rawBody) as Deposit;
    } catch {
      return null;
    }
    const reference = typeof payload.depositId === "string" ? payload.depositId : "";
    if (!UUID_V4.test(reference)) return null;
    const status = String(payload.status ?? "").slice(0, 40);
    return {
      key: `${reference}:${status}`,
      type: `deposit.${status.toLowerCase() || "unknown"}`,
      reference,
      transactionId: null,
      payload,
    };
  }
}
