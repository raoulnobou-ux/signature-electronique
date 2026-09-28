/** Couleur des badges de statut d'une demande et d'un signataire. */
export const REQUEST_STATUS_VARIANT = {
  draft: "muted",
  pending: "warning",
  completed: "success",
  declined: "danger",
  expired: "muted",
  canceled: "muted",
} as const;
export type RequestStatus = keyof typeof REQUEST_STATUS_VARIANT;

export const SIGNER_STATUS_VARIANT = {
  pending: "muted",
  sent: "default",
  opened: "warning",
  signed: "success",
  declined: "danger",
  expired: "muted",
} as const;
export type SignerStatus = keyof typeof SIGNER_STATUS_VARIANT;
