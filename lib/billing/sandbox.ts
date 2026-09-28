import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { publicEnv } from "@/lib/env";
import type { CheckoutRequest, PaymentProvider, VerifiedTransaction } from "./provider";

/**
 * Prestataire « bac à sable » pour le développement et les tests automatisés, quand aucune
 * clé Flutterwave n'est configurée. Le checkout est une page de QuickSign qui simule
 * Mobile Money ou carte ; l'identifiant de transaction est signé par le serveur, donc
 * impossible à fabriquer depuis le navigateur. Jamais actif en production (voir index.ts).
 */
export const SANDBOX_OUTCOMES = ["successful", "failed"] as const;
export type SandboxOutcome = (typeof SANDBOX_OUTCOMES)[number];
export const SANDBOX_METHODS = ["mtn", "orange", "card"] as const;
export type SandboxMethod = (typeof SANDBOX_METHODS)[number];

function sign(secret: string, reference: string, outcome: string, method: string) {
  return createHmac("sha256", `sandbox:${secret}`)
    .update(`${reference}|${outcome}|${method}`)
    .digest("hex")
    .slice(0, 32);
}

export class SandboxProvider implements PaymentProvider {
  readonly name = "sandbox";

  constructor(private readonly secret: string) {}

  transactionId(reference: string, outcome: SandboxOutcome, method: SandboxMethod): string {
    return `sbx_${outcome}_${method}_${sign(this.secret, reference, outcome, method)}`;
  }

  async createCheckout(req: CheckoutRequest): Promise<{ url: string }> {
    return {
      url: `${publicEnv.NEXT_PUBLIC_APP_URL}/app/abonnement/paiement-test?ref=${encodeURIComponent(req.reference)}`,
    };
  }

  async verifyTransaction({
    reference,
    transactionId,
    expected,
  }: {
    reference: string;
    transactionId: string | null;
    expected: { amount: number; currency: string };
  }): Promise<VerifiedTransaction | null> {
    const match = /^sbx_(successful|failed)_(mtn|orange|card)_([0-9a-f]{32})$/.exec(transactionId ?? "");
    if (!match) return null;
    const [, outcome, method, signature] = match as unknown as [string, SandboxOutcome, SandboxMethod, string];
    const expectedSig = Buffer.from(sign(this.secret, reference, outcome, method));
    if (!timingSafeEqual(expectedSig, Buffer.from(signature))) return null;
    return {
      status: outcome,
      reference,
      transactionId: transactionId!,
      amount: expected.amount,
      currency: expected.currency,
      method: method === "card" ? "card" : `mobilemoney_${method}`,
      failureReason: outcome === "failed" ? "Solde insuffisant (simulation)" : null,
    };
  }

  parseWebhook(): null {
    return null;
  }
}
