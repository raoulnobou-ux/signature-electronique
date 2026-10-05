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
  /** Pays du numéro Mobile Money choisi par le client (ISO alpha-3, pawaPay). */
  country?: string;
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

/** Moyen de paiement proposé au client. */
export type PaymentMethod = "card" | "mobile_money";

/** Moyen de paiement proposé à un client, avec ses devises. */
export interface PaymentOption {
  method: PaymentMethod;
  /** Devises proposées pour ce moyen de paiement. */
  currencies: Currency[];
  /** Mode test du prestataire (aucun argent réel). */
  testMode: boolean;
}

/**
 * Prestataire de paiement. L'application ne connaît que cette interface :
 * - providers/card/ : paiement international par carte (Paddle aujourd'hui) ;
 * - providers/african/ : moyens de paiement locaux africains (pawaPay, Mobile Money) ;
 * - un nouveau prestataire s'ajoute en implémentant cette interface puis en le déclarant
 *   dans le registre (lib/billing/index.ts), sans toucher aux écrans ni aux actions.
 * Le navigateur n'appelle jamais un prestataire : il appelle notre serveur, qui crée le
 * paiement, puis revérifie toute transaction auprès du prestataire (webhook ou retour).
 */
export interface PaymentProvider {
  /** Identifiant stocké dans payments.provider et subscriptions.provider. */
  readonly name: string;
  readonly method: PaymentMethod;
  /** Devises acceptées par ce prestataire. */
  readonly currencies: readonly Currency[];
  /** Le prestataire accepte-t-il un client de ce pays (ISO alpha-2) ? Absent = partout. */
  supportsCountry?(country: string): boolean;
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
  /** Arrête le renouvellement automatique d'un abonnement récurrent (si le prestataire en gère). */
  cancelSubscription?(providerSubscriptionId: string): Promise<void>;
  /** Rembourse une transaction (si le prestataire le permet). */
  refund?(input: { transactionId: string; reason: string }): Promise<void>;
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
