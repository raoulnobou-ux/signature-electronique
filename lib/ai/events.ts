/** Événements envoyés par /api/assistant (une ligne JSON par événement). */

export const TOUR_TARGETS = [
  "import",
  "documents",
  "signatures",
  "new-signature",
  "requests",
  "templates",
  "team",
  "billing",
  "settings",
  "search",
] as const;
export type TourTarget = (typeof TOUR_TARGETS)[number];

export type ZoneType = "signature" | "initials" | "date" | "name" | "text" | "mention";

export interface ProposedZone {
  page: number; // 0-based
  x: number;
  y: number;
  w: number;
  h: number;
  type: ZoneType;
  signer: string;
  reason: string;
}

export type AssistantAction =
  | { kind: "highlight"; target: TourTarget; label: string }
  | { kind: "zones"; documentId: string; zones: ProposedZone[]; summary: string }
  | {
      kind: "request_draft";
      documentId: string;
      signers: { name: string; email: string; phone: string }[];
      mode: "sequential" | "parallel";
      message: string;
      zones: ProposedZone[];
    }
  | { kind: "draft_document"; title: string; body: string }
  | { kind: "documents"; items: { id: string; title: string; status: string; createdAt: string }[] }
  | {
      kind: "remind";
      items: {
        signerId: string;
        name: string;
        documentTitle: string;
        requestId: string;
        status: string;
      }[];
    };

export type AssistantErrorCode =
  | "not_configured"
  | "quota"
  | "rate_limited"
  | "refusal"
  | "read_only"
  | "feature_not_in_plan"
  | "invalid"
  | "server";

export type AssistantEvent =
  | { type: "meta"; conversationId: string }
  | { type: "text"; delta: string }
  | { type: "tool"; name: string; status: "start" | "done" }
  | { type: "action"; action: AssistantAction }
  | { type: "done"; remaining: number | null }
  | { type: "error"; code: AssistantErrorCode };

/** Suggestions prêtes à l'emploi (réponses mises en cache : questions fréquentes). */
export const SUGGESTIONS = {
  "how-sign": "Comment signer mon premier document ?",
  "how-import-word": "Comment importer un document Word ?",
  plans: "Quelle est la différence entre Essentiel et Pro ?",
  legal: "Une signature électronique est-elle valable au Cameroun ?",
  request: "Comment faire signer un document par plusieurs personnes ?",
  stamp: "Comment créer le cachet de mon entreprise ?",
} as const;
export type SuggestionId = keyof typeof SUGGESTIONS;

/** Actions rapides sur un document joint (Pro). */
export const QUICK_ACTIONS = {
  summarize: "Résume ce document en quelques points clairs.",
  "key-info":
    "Extrais les informations clés de ce document : parties, montants, dates, durée, obligations.",
  risks:
    "Relève les clauses à vérifier ou inhabituelles dans ce document (sans conseil juridique).",
  zones: "Repère les zones où ce document doit être signé, paraphé ou daté.",
  translate: "Traduis ce document en anglais (texte intégral, en conservant la structure).",
} as const;
export type QuickActionId = keyof typeof QUICK_ACTIONS;

/** Mêmes questions et actions en anglais (interface en anglais). */
export const SUGGESTIONS_EN: Record<SuggestionId, string> = {
  "how-sign": "How do I sign my first document?",
  "how-import-word": "How do I import a Word document?",
  plans: "What is the difference between Essential and Pro?",
  legal: "Is an electronic signature valid in Cameroon?",
  request: "How do I get a document signed by several people?",
  stamp: "How do I create my company stamp?",
};

export const QUICK_ACTIONS_EN: Record<QuickActionId, string> = {
  summarize: "Summarize this document in a few clear points.",
  "key-info":
    "Extract the key information from this document: parties, amounts, dates, duration, obligations.",
  risks: "List the clauses to check or that are unusual in this document (no legal advice).",
  zones: "Find where this document must be signed, initialed or dated.",
  translate: "Translate this document into French (full text, keeping the structure).",
};

export function suggestionText(id: SuggestionId, locale: string): string {
  return locale === "en" ? SUGGESTIONS_EN[id] : SUGGESTIONS[id];
}

export function quickActionText(id: QuickActionId, locale: string): string {
  return locale === "en" ? QUICK_ACTIONS_EN[id] : QUICK_ACTIONS[id];
}
