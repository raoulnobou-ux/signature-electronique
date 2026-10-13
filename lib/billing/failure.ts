/**
 * Cause d'un paiement non abouti, telle que montrée au client (page de retour, e-mail).
 * Les codes bruts (payments.failure_reason : statut Notch Pay ou contrôle interne) ne sont
 * jamais affichés tels quels.
 */
export type FailureKind = "declined" | "canceled" | "expired" | "technical";

export function failureKind(reason: string | null | undefined): FailureKind {
  const r = (reason ?? "").toLowerCase();
  if (r === "canceled" || r === "cancelled" || r === "abandoned") return "canceled";
  if (r === "expired") return "expired";
  if (
    r.startsWith("checkout_error") ||
    r === "amount_mismatch" ||
    r === "reference_mismatch" ||
    r === "sandbox_transaction"
  )
    return "technical";
  // failed, rejected, refunded… : refusé par l'opérateur ou la banque (solde, code, plafond).
  return "declined";
}

const TEXTS: Record<"fr" | "en", Record<FailureKind, string>> = {
  fr: {
    declined:
      "Le paiement a été refusé par votre opérateur ou votre banque (solde insuffisant, code secret erroné ou demande non validée sur le téléphone).",
    canceled: "Le paiement a été annulé avant d'être validé.",
    expired: "Le délai de paiement est dépassé : la demande n'a pas été validée à temps.",
    technical: "Le paiement n'a pas pu être vérifié. Aucun abonnement n'a été activé.",
  },
  en: {
    declined:
      "The payment was declined by your operator or bank (insufficient balance, wrong PIN, or the request wasn't approved on your phone).",
    canceled: "The payment was canceled before it was approved.",
    expired: "The payment timed out: the request wasn't approved in time.",
    technical: "The payment couldn't be verified. No subscription was activated.",
  },
};

/** Phrase simple pour l'e-mail d'échec (jamais de texte technique). */
export function failureText(reason: string | null | undefined, locale: "fr" | "en"): string {
  return TEXTS[locale][failureKind(reason)];
}
