/**
 * Statut affiché d'une demande de signature, déduit de son statut en base et de celui
 * de ses signataires :
 * - Brouillon : préparée, pas encore envoyée ;
 * - Envoyé : invitations parties, personne n'a encore ouvert le document ;
 * - Vu : au moins un signataire a ouvert le document, aucune signature encore ;
 * - En attente : signée par une partie des signataires, on attend les autres ;
 * - Signé, Refusé, Expiré, Annulé : demande terminée.
 */
export const DISPLAY_STATUSES = [
  "draft",
  "sent",
  "viewed",
  "waiting",
  "signed",
  "declined",
  "expired",
  "canceled",
] as const;
export type DisplayStatus = (typeof DISPLAY_STATUSES)[number];

export function isDisplayStatus(value: unknown): value is DisplayStatus {
  return typeof value === "string" && (DISPLAY_STATUSES as readonly string[]).includes(value);
}

export function displayRequestStatus(
  status: string,
  signers: readonly { status: string }[],
): DisplayStatus {
  switch (status) {
    case "draft":
      return "draft";
    case "completed":
      return "signed";
    case "declined":
    case "expired":
    case "canceled":
      return status;
    default:
      if (signers.some((s) => s.status === "signed")) return "waiting";
      if (signers.some((s) => s.status === "opened")) return "viewed";
      return "sent";
  }
}
