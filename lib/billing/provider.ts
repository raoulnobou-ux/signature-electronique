import type { Currency } from "@/lib/entitlements/plans";

/** Statut d'une transaction tel que confirmé par le prestataire (jamais par le navigateur). */
export type TransactionStatus = "successful" | "failed" | "pending";

export interface CheckoutRequest {
  /** Notre référence unique (payments.provider_ref), renvoyée par le prestataire. */
  reference: string;
  amount: number;
  currency: Currency;
  description: string;
  /** Nom du produit affiché par le prestataire (« QuickSign Pro »). */
  productName: string;
  /** Langue de la page de paiement. */
  language: "fr" | "en";
  customer: { email: string; name: string; phone: string | null; city?: string | null };
  /** URL de retour du navigateur après paiement. */
  redirectUrl: string;
  /** Page de QuickSign qui ouvre le formulaire du prestataire (Paddle.js). */
  checkoutPageUrl?: string;
  meta: Record<string, string>;
}

export interface VerifiedTransaction {
  status: TransactionStatus;
  reference: string;
  transactionId: string;
  amount: number;
  currency: string;
  /** Moyen de paiement (MTN_MOMO_CMR, ORANGE_CMR, card, paypal…), pour le reçu. */
  method: string | null;
  failureReason: string | null;
}

export interface WebhookEvent {
  /** Clé d'idempotence (un même événement reçu deux fois n'est traité qu'une fois). */
  key: string;
  type: string;
  reference: string | null;
  transactionId: string | null;
  payload: unknown;
}

/**
 * Couche d'abstraction des paiements : pawaPay (Mobile Money, FCFA) et Paddle (carte,
 * international, dollars) ; un autre prestataire s'ajoute sans toucher au reste de l'application.
 */
export interface PaymentProvider {
  readonly name: string;
  /** URL du paiement, et l'identifiant de transaction du prestataire s'il est déjà connu. */
  createCheckout(request: CheckoutRequest): Promise<{ url: string; transactionId?: string }>;
  /**
   * Revérifie une transaction auprès du prestataire. `expected` n'est utilisé que par le
   * bac à sable local ; les vrais prestataires renvoient leurs propres montants.
   */
  verifyTransaction(input: {
    reference: string;
    transactionId: string | null;
    expected: { amount: number; currency: Currency };
  }): Promise<VerifiedTransaction | null>;
  /** Authentifie et décode un webhook ; null si la requête n'est pas authentique. */
  parseWebhook(headers: Headers, rawBody: string): WebhookEvent | null;
}

export class PaymentProviderError extends Error {
  constructor(
    message: string,
    readonly detail?: unknown,
  ) {
    super(message);
    this.name = "PaymentProviderError";
  }
}
