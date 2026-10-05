import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import type { Account } from "@/lib/auth/account";
import type { Json } from "@/lib/supabase/database.types";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AssistantAction } from "./events";
import { extractLayout, formatLayout, type LayoutLine } from "./layout";

type Block = Anthropic.Beta.BetaContentBlockParam;
type MessageParam = Anthropic.Beta.BetaMessageParam;

/**
 * Référence de document stockée dans l'historique à la place du PDF : le fichier (version
 * figée) est relu et réinséré à l'identique à chaque tour. L'historique reste en ajout seul
 * et la base ne duplique pas les documents.
 */
export type DocumentRef = {
  type: "document_ref";
  documentId: string;
  path: string;
  title: string;
  pages: number;
};
type StoredBlock = Block | DocumentRef;

/** Un PDF de plus de 20 Mo n'est pas envoyé tel quel (limite de requête) : texte seul. */
const MAX_PDF_BYTES = 20 * 1024 * 1024;
const CONTEXT_RE = /^<contexte>[\s\S]*?<\/contexte>\s*/;

export async function loadDocument(
  path: string,
): Promise<{ bytes: Uint8Array; lines: LayoutLine[]; pageCount: number; truncated: boolean }> {
  const { data } = await createAdminClient().storage.from("documents").download(path);
  if (!data) throw new Error("document introuvable");
  const bytes = new Uint8Array(await data.arrayBuffer());
  const layout = await extractLayout(bytes);
  return { bytes, ...layout };
}

/** Blocs envoyés au modèle pour un document joint : le PDF + le relevé des lignes positionnées. */
export async function documentBlocks(
  ref: DocumentRef,
  cache: Map<string, Awaited<ReturnType<typeof loadDocument>>>,
): Promise<Block[]> {
  let doc = cache.get(ref.path);
  if (!doc) {
    doc = await loadDocument(ref.path);
    cache.set(ref.path, doc);
  }
  const blocks: Block[] = [];
  if (doc.bytes.byteLength <= MAX_PDF_BYTES) {
    blocks.push({
      type: "document",
      source: {
        type: "base64",
        media_type: "application/pdf",
        data: Buffer.from(doc.bytes).toString("base64"),
      },
      title: ref.title,
    });
  }
  blocks.push({
    type: "text",
    text: `Document joint « ${ref.title} » (identifiant ${ref.documentId}, ${doc.pageCount} pages). Relevé des lignes (positions en % de la page, origine en haut à gauche)${doc.truncated ? ", tronqué" : ""} :\n${formatLayout(doc.lines)}`,
  });
  return blocks;
}

async function expand(
  blocks: StoredBlock[],
  cache: Map<string, Awaited<ReturnType<typeof loadDocument>>>,
): Promise<Block[]> {
  const out: Block[] = [];
  for (const block of blocks) {
    if ((block as DocumentRef).type === "document_ref")
      out.push(...(await documentBlocks(block as DocumentRef, cache)));
    else out.push(block as Block);
  }
  return out;
}

export async function loadHistory(
  conversationId: string,
  cache: Map<string, Awaited<ReturnType<typeof loadDocument>>>,
): Promise<MessageParam[]> {
  const { data } = await createAdminClient()
    .from("ai_messages")
    .select("role, content")
    .eq("conversation_id", conversationId)
    .order("created_at")
    .order("id");
  const history: MessageParam[] = [];
  for (const row of data ?? []) {
    history.push({
      role: row.role as "user" | "assistant",
      content: await expand(row.content as StoredBlock[], cache),
    });
  }
  return history;
}

export async function saveTurn(
  conversationId: string,
  userBlocks: StoredBlock[],
  appended: MessageParam[],
  actions: AssistantAction[],
  tokens: { in: number; out: number },
) {
  const admin = createAdminClient();
  // Horodatages croissants : l'ordre de l'historique est exactement celui des échanges.
  const base = Date.now();
  const rows = [
    {
      role: "user",
      content: userBlocks,
      tool_calls: null as Json | null,
      tokens_in: null as number | null,
      tokens_out: null as number | null,
    },
    ...appended.map((m, i) => ({
      role: m.role,
      content: m.content,
      tool_calls: i === appended.length - 1 && actions.length ? (actions as unknown as Json) : null,
      tokens_in: i === appended.length - 1 ? tokens.in : null,
      tokens_out: i === appended.length - 1 ? tokens.out : null,
    })),
  ].map((row, i) => ({
    conversation_id: conversationId,
    role: row.role,
    content: row.content as unknown as NonNullable<Json>,
    tool_calls: row.tool_calls,
    tokens_in: row.tokens_in,
    tokens_out: row.tokens_out,
    created_at: new Date(base + i).toISOString(),
  }));
  await admin.from("ai_messages").insert(rows);
  await admin
    .from("ai_conversations")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", conversationId);
}

/** Contexte ajouté au message (prénom, plan, écran, quota) — jamais d'autre donnée personnelle. */
export function contextBlock(
  account: Account,
  path: string,
  remaining: number | null,
  locale = "fr",
): string {
  const ent = account.entitlements;
  const plan =
    ent.state === "trial"
      ? `essai Pro (${ent.trialDaysRemaining ?? 0} jour(s) restant(s))`
      : ent.effectivePlan === "pro"
        ? account.sponsor
          ? `Pro (via l'équipe ${account.sponsor.teamName})`
          : "Pro"
        : ent.effectivePlan === "essential"
          ? "Essentiel"
          : "accès gratuit (sans abonnement : un document, éditeur en découverte, pas de signature finale ni d'export)";
  const first = account.profile.full_name.split(/\s+/)[0] || "";
  return `<contexte>Prénom : ${first || "inconnu"} · Plan : ${plan} · Écran : ${path.slice(0, 120)} · Messages à l'assistant restants aujourd'hui : ${remaining === null ? "illimité" : remaining} · Langue de l'interface : ${locale === "en" ? "anglais (réponds en anglais)" : "français"}</contexte>`;
}

/** Messages lisibles (historique affiché) : texte tapé, réponses, actions proposées. */
export interface DisplayMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  actions: AssistantAction[];
  document: string | null;
}

export function toDisplay(
  rows: { id: string; role: string; content: unknown; tool_calls: unknown }[],
): DisplayMessage[] {
  const out: DisplayMessage[] = [];
  for (const row of rows) {
    const blocks = (row.content ?? []) as StoredBlock[];
    const texts = blocks
      .filter((b): b is Anthropic.Beta.BetaTextBlockParam => b.type === "text")
      .map((b) => b.text);
    if (row.role === "user") {
      if (!texts.length) continue; // résultats d'outils
      const doc = blocks.find((b): b is DocumentRef => (b as DocumentRef).type === "document_ref");
      out.push({
        id: row.id,
        role: "user",
        text: texts.join("\n").replace(CONTEXT_RE, ""),
        actions: [],
        document: doc?.title ?? null,
      });
      continue;
    }
    const actions = (row.tool_calls ?? []) as AssistantAction[];
    const text = texts.join("\n\n").trim();
    const last = out.at(-1);
    // Plusieurs messages de l'assistant dans un même tour : fusionnés à l'affichage.
    if (last?.role === "assistant") {
      last.text = [last.text, text].filter(Boolean).join("\n\n");
      last.actions.push(...actions);
    } else out.push({ id: row.id, role: "assistant", text, actions: [...actions], document: null });
  }
  return out;
}
