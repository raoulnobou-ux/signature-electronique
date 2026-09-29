import type { BuilderField, BuilderPreset } from "@/components/requests/request-builder";
import type { ProposedZone } from "@/lib/ai/events";
import { mentionsFor } from "@/lib/pdf/fields";

/** Brouillon de demande préparé par l'assistant, transmis à l'écran de préparation. */
export type AssistantDraft = {
  signers: { name: string; email: string; phone: string }[];
  zones: ProposedZone[];
  mode: "sequential" | "parallel";
  message: string;
};

const key = (documentId: string) => `quicksign:assistant-draft:${documentId}`;

export function saveAssistantDraft(documentId: string, draft: AssistantDraft) {
  try {
    sessionStorage.setItem(key(documentId), JSON.stringify(draft));
  } catch {
    /* stockage indisponible : la demande s'ouvre simplement vide */
  }
}

export function readAssistantDraft(documentId: string): AssistantDraft | null {
  try {
    const raw = sessionStorage.getItem(key(documentId));
    return raw ? (JSON.parse(raw) as AssistantDraft) : null;
  } catch {
    return null;
  }
}

/** Rôles des zones (« Bailleur »…) → signataires ; chaque zone rattachée au bon signataire. */
export function draftToPreset(draft: AssistantDraft, locale = "fr"): BuilderPreset {
  const roles: string[] = [];
  for (const zone of draft.zones) if (!roles.includes(zone.signer)) roles.push(zone.signer);
  const count = Math.max(draft.signers.length, roles.length, 1);
  const signers = Array.from({ length: Math.min(count, 10) }, (_, i) => ({
    name: draft.signers[i]?.name ?? "",
    email: draft.signers[i]?.email ?? "",
    phone: draft.signers[i]?.phone ?? "",
    role: roles[i],
  }));
  const fields: BuilderField[] = draft.zones.map((zone, i) => ({
    id: `ai${i}${Math.random().toString(36).slice(2, 8)}`,
    page: zone.page,
    x: zone.x,
    y: zone.y,
    w: zone.w,
    h: zone.h,
    rotation: 0,
    opacity: 1,
    type: zone.type,
    assetId: null,
    value: zone.type === "mention" ? mentionsFor(locale)[0]! : null,
    signer: Math.min(Math.max(0, roles.indexOf(zone.signer)), signers.length - 1),
    required: true,
  }));
  return { signers, fields, message: draft.message, mode: draft.mode };
}
