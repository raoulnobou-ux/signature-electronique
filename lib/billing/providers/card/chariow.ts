import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { parsePhoneNumberFromString } from "libphonenumber-js";
import type { BillingCycle, PaidPlan } from "@/lib/entitlements/plans";
import { logAppError } from "@/lib/monitoring/app-errors";
import {
  PaymentProviderError,
  errorKindForStatus,
  providerErrorKind,
  type CheckoutRequest,
  type PaymentProvider,
  type TransactionStatus,
  type VerifiedTransaction,
  type WebhookEvent,
} from "../types";

/**
 * Chariow (chariow.dev) : boutique de produits numériques qui encaisse pour le compte du
 * vendeur (carte bancaire et moyens locaux selon le pays de l'acheteur), puis lui reverse
 * les fonds. Chaque plan et période est un produit de type « Licence », le seul que l'on
 * peut racheter (renouvellement) : les autres types renvoient « already_purchased ».
 *
 * Prix fixés dans Chariow : pas de montant libre, donc pas de passage au Pro au prorata
 * (proposé par Mobile Money). Le prix du produit est comparé à celui de QuickSign avant
 * d'envoyer le client payer, et le montant de la vente est revérifié avant activation.
 */
export const CHARIOW_API = "https://api.chariow.com/v1";

export type ChariowProducts = Record<`${PaidPlan}.${BillingCycle}`, string | undefined>;

/** Identifiant de vente Chariow (« sal_… »). */
const SALE_ID = /^sal_[A-Za-z0-9]{4,60}$/;
/** Notre référence (payments.provider_ref) : UUID v4. */
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Statut d'une vente Chariow → statut interne. */
export function mapChariowStatus(status: string | undefined): TransactionStatus {
  const s = (status ?? "").toLowerCase();
  if (s === "completed" || s === "settled") return "successful";
  // « failed » et « abandoned » ne sont pas toujours définitifs chez Chariow : une vente peut
  // être rouverte puis réussir. QuickSign note l'échec ; une réussite ultérieure (notification
  // successful.sale) active quand même l'abonnement (complete_payment accepte un paiement échoué).
  if (s === "failed" || s === "abandoned") return "failed";
  return "pending"; // initiated, awaiting_payment
}

/** Événements qui règlent un paiement ; les autres (licences, affiliés…) sont ignorés. */
const SETTLING_EVENTS = new Set(["successful.sale", "failed.sale"]);

/**
 * Signature d'une notification (Pulse) : « sha256= » + HMAC-SHA256 hexadécimal du corps brut
 * avec le secret de la Pulse (« whsec_… »), comparée en temps constant.
 */
export function verifyChariowSignature(
  header: string | null,
  rawBody: string,
  secret: string,
): boolean {
  if (!header || !/^sha256=[0-9a-f]{64}$/i.test(header)) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  return timingSafeEqual(
    Buffer.from(expected, "hex"),
    Buffer.from(header.slice("sha256=".length).toLowerCase(), "hex"),
  );
}

/** Prénom et nom exigés par Chariow (50 caractères au plus chacun). */
export function splitName(fullName: string, email: string): { first: string; last: string } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  const fallback = email.split("@")[0] || "Client";
  const first = (parts[0] ?? fallback).slice(0, 50);
  const last = (parts.length > 1 ? parts.slice(1).join(" ") : first).slice(0, 50);
  return { first, last };
}

/** Numéro international (+237…) → numéro national et pays, comme l'attend Chariow. */
export function chariowPhone(
  phone: string | null,
): { number: string; country_code: string } | null {
  if (!phone) return null;
  const parsed = parsePhoneNumberFromString(phone);
  if (!parsed?.isValid() || !parsed.country) return null;
  return { number: String(parsed.nationalNumber), country_code: parsed.country };
}

type Amount = { value?: unknown; currency?: unknown };
type Sale = {
  id?: unknown;
  status?: unknown;
  amount?: Amount;
  custom_metadata?: Record<string, unknown> | null;
  product?: { id?: unknown } | null;
  payment?: { status?: unknown; method?: unknown; channel?: unknown } | null;
};

export class ChariowProvider implements PaymentProvider {
  readonly name = "chariow";
  readonly method = "card" as const;
  /** Produits en FCFA : l'acheteur paie ce montant, quel que soit son pays. */
  readonly currencies = ["XAF"] as const;
  /** Prix fixés dans Chariow : pas de montant calculé (prorata). */
  readonly fixedPrices = true;
  readonly testMode = false;

  constructor(
    private readonly apiKey: string,
    private readonly products: ChariowProducts,
    /** Secret de signature de la Pulse (« whsec_… ») ; sans lui, notifications refusées. */
    private readonly pulseSecret?: string,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  /** Produit Chariow d'un plan et d'une période, s'il est configuré. */
  productFor(plan: PaidPlan, cycle: BillingCycle): string | null {
    const id = this.products[`${plan}.${cycle}`];
    return id && /^[A-Za-z0-9_-]{3,100}$/.test(id) ? id : null;
  }

  private async request(path: string, init: { method: "GET" | "POST"; body?: unknown }) {
    const response = await this.fetcher(`${CHARIOW_API}${path}`, {
      method: init.method,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        Accept: "application/json",
        ...(init.body ? { "Content-Type": "application/json" } : {}),
      },
      body: init.body ? JSON.stringify(init.body) : undefined,
      signal: AbortSignal.timeout(20_000),
    });
    const body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
    return { status: response.status, body };
  }

  private static message(body: Record<string, unknown> | null): string {
    const raw = typeof body?.message === "string" ? body.message : "réponse invalide";
    return raw.replace(/\+?\d{8,}/g, "[numéro]").slice(0, 200);
  }

  async createCheckout(req: CheckoutRequest): Promise<{ url: string; transactionId?: string }> {
    if (!UUID_V4.test(req.reference)) {
      throw new PaymentProviderError("Chariow : la référence doit être un UUID v4");
    }
    if (!req.plan || !req.cycle) throw new PaymentProviderError("Chariow : plan inconnu");
    if (req.kind === "upgrade") {
      throw new PaymentProviderError("Chariow : pas de prorata (prix fixes)", null, "rejected");
    }
    const productId = this.productFor(req.plan, req.cycle);
    if (!productId) {
      throw new PaymentProviderError(
        `Chariow : produit non configuré pour ${req.plan}.${req.cycle}`,
        null,
        "config",
      );
    }
    const phone = chariowPhone(req.customer.phone);
    if (!phone)
      throw new PaymentProviderError("Chariow : numéro de téléphone requis", null, "rejected");

    // Le prix du produit doit être celui de QuickSign : sinon le client paierait un montant
    // que la vérification refuserait ensuite (paiement sans abonnement).
    const product = await this.request(`/products/${encodeURIComponent(productId)}`, {
      method: "GET",
    });
    if (product.status >= 300) {
      throw new PaymentProviderError(
        `Chariow ${product.status} (produit) : ${ChariowProvider.message(product.body)}`,
        null,
        errorKindForStatus(product.status),
        product.status,
      );
    }
    const data = product.body?.data as
      { status?: unknown; type?: unknown; pricing?: { current_price?: Amount } } | undefined;
    const price = data?.pricing?.current_price;
    if (
      Number(price?.value) !== Math.round(req.amount) ||
      String(price?.currency ?? "").toUpperCase() !== req.currency
    ) {
      throw new PaymentProviderError(
        `Chariow : le produit ${productId} coûte ${String(price?.value)} ${String(price?.currency)}, QuickSign attend ${Math.round(req.amount)} ${req.currency}`,
        null,
        "config",
      );
    }

    const { first, last } = splitName(req.customer.name, req.customer.email);
    const { status, body } = await this.request("/checkout", {
      method: "POST",
      body: {
        product_id: productId,
        email: req.customer.email,
        first_name: first,
        last_name: last,
        phone,
        redirect_url: req.redirectUrl,
        custom_metadata: { qs_ref: req.reference, qs_kind: req.kind ?? "new" },
        ...(req.customerIp ? { customer_ip: req.customerIp } : {}),
      },
    });
    if (status >= 300) {
      throw new PaymentProviderError(
        `Chariow ${status} : ${ChariowProvider.message(body)}`,
        null,
        errorKindForStatus(status),
        status,
      );
    }
    const result = body?.data as
      | { step?: unknown; purchase?: { id?: unknown } | null; payment?: { checkout_url?: unknown } }
      | undefined;
    const saleId =
      typeof result?.purchase?.id === "string" && SALE_ID.test(result.purchase.id)
        ? result.purchase.id
        : undefined;
    if (result?.step === "completed") {
      // Montant nul (remise de 100 %) : vente déjà terminée, revérifiée sur la page d'état.
      return { url: req.redirectUrl, transactionId: saleId };
    }
    const url = result?.payment?.checkout_url;
    if (result?.step !== "payment" || typeof url !== "string" || !/^https:\/\//.test(url)) {
      throw new PaymentProviderError(
        `Chariow : étape inattendue (${String(result?.step)})`,
        null,
        "invalid_response",
      );
    }
    return { url, transactionId: saleId };
  }

  /**
   * Revérifie la vente par l'API (GET /sales/{id}) : son identifiant a été noté par notre
   * serveur à la création. Statut, montant et devise sont relus chez Chariow ; si la vente
   * porte notre référence, elle doit correspondre.
   */
  async verifyTransaction({
    reference,
    transactionId,
  }: {
    reference: string;
    transactionId: string | null;
  }): Promise<VerifiedTransaction | null> {
    if (!transactionId || !SALE_ID.test(transactionId)) return null;
    let response: Awaited<ReturnType<ChariowProvider["request"]>>;
    try {
      response = await this.request(`/sales/${encodeURIComponent(transactionId)}`, {
        method: "GET",
      });
    } catch (error) {
      await logAppError(
        "billing.chariow_verify",
        `${reference} — ${providerErrorKind(error)}: ${error instanceof Error ? error.message : error}`,
        { code: transactionId },
      );
      throw error;
    }
    const { status, body } = response;
    if (status >= 300) {
      if (status !== 404) {
        await logAppError(
          "billing.chariow_verify",
          `${reference} — ${errorKindForStatus(status)}: HTTP ${status}`,
          { code: transactionId },
        );
      }
      return null;
    }
    const sale = body?.data as Sale | undefined;
    if (!sale || sale.id !== transactionId) return null;
    const metaRef = sale.custom_metadata?.qs_ref;
    const knownProducts = Object.values(this.products).filter(Boolean);
    const productId = typeof sale.product?.id === "string" ? sale.product.id : null;
    if (
      (typeof metaRef === "string" && metaRef !== reference) ||
      (productId && !knownProducts.includes(productId))
    ) {
      return {
        status: "failed",
        reference: typeof metaRef === "string" ? metaRef : "",
        transactionId,
        amount: 0,
        currency: "",
        method: null,
        failureReason: "reference_mismatch",
      };
    }
    const result = mapChariowStatus(typeof sale.status === "string" ? sale.status : undefined);
    if (result === "failed") {
      await logAppError("billing.chariow_failed", `${reference} — status=${String(sale.status)}`, {
        code: transactionId,
      });
    }
    return {
      status: result,
      reference,
      transactionId,
      amount: Number(sale.amount?.value),
      currency: String(sale.amount?.currency ?? "").toUpperCase(),
      method: "chariow",
      failureReason: result === "failed" ? String(sale.status) : null,
    };
  }

  /**
   * Notification (Pulse). Signature toujours exigée ; clé d'idempotence : x-pulse-delivery-id
   * (stable d'une tentative à l'autre). Le contenu n'est jamais cru : seules notre référence
   * et l'identifiant de vente servent, puis la vente est relue par l'API.
   */
  parseWebhook(headers: Headers, rawBody: string): WebhookEvent | null {
    if (!this.pulseSecret) return null;
    if (!verifyChariowSignature(headers.get("x-chariow-signature"), rawBody, this.pulseSecret)) {
      return null;
    }
    let payload: { event?: unknown; sale?: Sale };
    try {
      payload = JSON.parse(rawBody) as typeof payload;
    } catch {
      return null;
    }
    const type = String(headers.get("x-pulse-event") ?? payload.event ?? "unknown").slice(0, 60);
    const deliveryId = headers.get("x-pulse-delivery-id")?.slice(0, 120);
    const sale = payload.sale ?? {};
    const saleId = typeof sale.id === "string" && SALE_ID.test(sale.id) ? sale.id : null;
    const metaRef = sale.custom_metadata?.qs_ref;
    const reference = typeof metaRef === "string" && UUID_V4.test(metaRef) ? metaRef : null;
    const settles = SETTLING_EVENTS.has(type);
    return {
      key: deliveryId || `${saleId ?? "?"}:${type}`,
      type,
      reference: settles ? reference : null,
      transactionId: settles ? saleId : null,
      // Journal (payment_events) : jamais le client (nom, e-mail, téléphone) envoyé par Chariow.
      payload: {
        event: type,
        sale: {
          id: saleId,
          status: typeof sale.status === "string" ? sale.status : null,
          amount: sale.amount ?? null,
          qs_ref: reference,
        },
      },
    };
  }
}
