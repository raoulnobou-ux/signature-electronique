import "server-only";
import { CFA_COUNTRIES } from "./cfa";
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

/**
 * Adresse d'API pawaPay saisie dans la configuration : https, domaine pawapay.io uniquement
 * (le jeton y est envoyé), sans « / » final ni suffixe de version ; sinon null.
 */
export function pawapayApiUrl(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:") return null;
    if (url.hostname !== "pawapay.io" && !url.hostname.endsWith(".pawapay.io")) return null;
    return url.origin;
  } catch {
    return null;
  }
}

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

/**
 * Pays où le compte pawaPay accepte des dépôts en franc CFA, d'après sa configuration
 * active (GET /v2/active-conf) : seuls ces pays sont proposés au client.
 */
export function cfaDepositCountries(activeConf: unknown): string[] {
  const countries = (activeConf as { countries?: unknown })?.countries;
  if (!Array.isArray(countries)) return [];
  const result: string[] = [];
  for (const item of countries as { country?: string; providers?: unknown }[]) {
    const code = item?.country;
    const expected = code ? CFA_COUNTRIES[code]?.currency : undefined;
    if (!code || !expected || !Array.isArray(item.providers)) continue;
    const accepts = (item.providers as { currencies?: unknown }[]).some(
      (provider) =>
        Array.isArray(provider?.currencies) &&
        (provider.currencies as { currency?: string }[]).some((c) => c?.currency === expected),
    );
    if (accepts && !result.includes(code)) result.push(code);
  }
  return result;
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
  private countriesCache: { value: string[]; until: number } | null = null;

  constructor(
    private readonly token: string,
    /** Environnement (« sandbox », « production ») ou adresse d'API déjà validée. */
    target: PawaPayEnvironment | string,
    private readonly fetcher: typeof fetch = fetch,
  ) {
    this.base = target in PAWAPAY_API ? PAWAPAY_API[target as PawaPayEnvironment] : target;
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
    const country = req.country && CFA_COUNTRIES[req.country] ? req.country : "CMR";
    const cfa = CFA_COUNTRIES[country]!;
    const { status, body } = await this.request("/v2/paymentpage", {
      method: "POST",
      body: {
        depositId: req.reference,
        returnUrl: req.redirectUrl,
        customerMessage: customerMessage(`QuickSign ${req.description}`),
        // Franc CFA de l'Ouest (XOF) pour un pays de l'UEMOA : même montant qu'en XAF.
        amountDetails: { amount: String(Math.round(req.amount)), currency: cfa.currency },
        country,
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

  /** Pays proposés au client (configuration active du compte), mis en cache 10 minutes. */
  async depositCountries(): Promise<string[]> {
    if (this.countriesCache && this.countriesCache.until > Date.now()) {
      return this.countriesCache.value;
    }
    const { status, body } = await this.request("/v2/active-conf?operationType=DEPOSIT", {
      method: "GET",
    });
    if (status >= 300) throw new PaymentProviderError(`pawaPay ${status}: active-conf`, body);
    const value = cfaDepositCountries(body);
    this.countriesCache = { value, until: Date.now() + 10 * 60_000 };
    return value;
  }

  /**
   * Diagnostic d'un jeton refusé (401) : le même jeton est-il accepté par l'autre
   * environnement pawaPay ? Ne renvoie qu'une conclusion, jamais le jeton.
   */
  async diagnoseToken(): Promise<string> {
    // Forme du jeton (jamais son contenu) : longueur, structure JWT, caractères suspects.
    const parts = this.token.split(".");
    const shape = `jeton de ${this.token.length} caractères, ${
      parts.length === 3 && parts.every(Boolean) ? "format JWT" : "format non JWT"
    }${/\s/.test(this.token) ? ", contient des espaces" : ""}`;
    return `${await this.tokenVerdict()} (${shape})`;
  }

  private async tokenVerdict(): Promise<string> {
    const other =
      this.base === PAWAPAY_API.production ? PAWAPAY_API.sandbox : PAWAPAY_API.production;
    const otherName = other === PAWAPAY_API.sandbox ? "bac à sable (sandbox)" : "production";
    try {
      const response = await this.fetcher(`${other}/v2/active-conf?operationType=DEPOSIT`, {
        headers: { Authorization: `Bearer ${this.token}`, Accept: "application/json" },
        signal: AbortSignal.timeout(15_000),
      });
      if (response.ok) {
        return `Jeton refusé ici mais accepté par l'environnement ${otherName} : c'est un jeton ${otherName}. Utilisez un jeton généré dans l'autre tableau de bord pawaPay, ou changez PAWAPAY_ENV.`;
      }
      return `Jeton refusé par les deux environnements pawaPay (${response.status} sur ${otherName}) : jeton incomplet, révoqué ou compte non activé.`;
    } catch {
      return `Jeton refusé ; vérification sur ${otherName} impossible (réseau).`;
    }
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
