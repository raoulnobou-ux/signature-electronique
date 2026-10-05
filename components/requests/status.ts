import type { DisplayStatus } from "@/lib/requests/status";

/** Couleur des badges de statut d'une demande (statut affiché) et d'un signataire. */
export const DISPLAY_STATUS_VARIANT = {
  draft: "muted",
  sent: "default",
  viewed: "warning",
  waiting: "warning",
  signed: "success",
  declined: "danger",
  expired: "muted",
  canceled: "muted",
} as const satisfies Record<DisplayStatus, string>;

export const SIGNER_STATUS_VARIANT = {
  pending: "muted",
  sent: "default",
  opened: "warning",
  signed: "success",
  declined: "danger",
  expired: "muted",
} as const;
export type SignerStatus = keyof typeof SIGNER_STATUS_VARIANT;
