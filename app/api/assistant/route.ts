import type Anthropic from "@anthropic-ai/sdk";
import { logAppError } from "@/lib/monitoring/app-errors";
import { getLocale } from "next-intl/server";
import { z } from "zod";
import { getCurrentAccount } from "@/lib/auth/account";
import { runTurn, type TurnResult } from "@/lib/ai/agent";
import { assistantBackend } from "@/lib/ai/client";
import { providerErrorCode } from "@/lib/ai/provider-error";
import {
  contextBlock,
  documentBlocks,
  loadDocument,
  loadHistory,
  saveTurn,
  type DocumentRef,
} from "@/lib/ai/conversations";
import {
  QUICK_ACTIONS,
  quickActionText,
  SUGGESTIONS,
  suggestionText,
  type AssistantAction,
  type AssistantEvent,
  type QuickActionId,
  type SuggestionId,
} from "@/lib/ai/events";
import { runMockTurn } from "@/lib/ai/mock";
import { toolsFor } from "@/lib/ai/tools";
import { checkAccess } from "@/lib/entitlements";
import { rateLimit } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSameOriginRequest } from "@/lib/security/origin";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 300;

const bodySchema = z.object({
  conversationId: z.uuid().optional(),
  message: z.string().trim().max(4000).optional(),
  suggestion: z.enum(Object.keys(SUGGESTIONS) as [SuggestionId, ...SuggestionId[]]).optional(),
  quickAction: z.enum(Object.keys(QUICK_ACTIONS) as [QuickActionId, ...QuickActionId[]]).optional(),
  documentId: z.uuid().optional(),
  path: z.string().max(200).default("/app"),
});

const FAQ_TTL_MS = 7 * 86_400_000;

function ndjson(run: (send: (event: AssistantEvent) => void) => Promise<void>): Response {
  const encoder = new TextEncoder();
  // Le client peut partir en cours de réponse (navigation) : le tour se termine et est
  // enregistré quand même, les événements restants sont simplement ignorés.
  let closed = false;
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: AssistantEvent) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
        } catch {
          closed = true;
        }
      };
      try {
        await run(send);
      } catch (error) {
        console.error("[assistant]", error);
        const code = providerErrorCode(error);
        await logAppError("assistant", error, { code });
        send({ type: "error", code });
      } finally {
        if (!closed) {
          closed = true;
          controller.close();
        }
      }
    },
    cancel() {
      closed = true;
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" },
  });
}

const fail = (code: Extract<AssistantEvent, { type: "error" }>["code"], status = 200) =>
  new Response(JSON.stringify({ type: "error", code }) + "\n", {
    status,
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8" },
  });

/**
 * QuickSign Copilot : un message de l'utilisateur → réponse en flux (NDJSON), outils
 * exécutés côté serveur sur ses seules données, historique enregistré, quota décompté.
 */
export async function POST(request: Request) {
  // Requête venue d'un autre site (CSRF) : refusée avant toute lecture de session.
  if (!isSameOriginRequest(request)) return fail("invalid", 403);
  // Corps limité (message, chemin, identifiants) : rien ne justifie plus de 64 Ko.
  if (Number(request.headers.get("content-length") ?? 0) > 64 * 1024) return fail("invalid", 413);
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("invalid", 400);
  const input = parsed.data;
  const account = await getCurrentAccount();
  if (!account) return fail("invalid", 401);
  const ent = account.entitlements;
  if (!account.emailConfirmed || !ent.features.ai_assistant) return fail("read_only");

  const locale = await getLocale();
  const userText = input.quickAction
    ? quickActionText(input.quickAction, locale)
    : input.suggestion
      ? suggestionText(input.suggestion, locale)
      : input.message;
  if (!userText) return fail("invalid", 400);
  const pro = ent.features.ai_advanced;
  if ((input.documentId || input.quickAction) && !pro) return fail("feature_not_in_plan");
  const access = checkAccess(ent, "ai_assistant", { kind: "aiMessagesToday" });
  if (!access.ok) return fail(access.reason === "quota_exceeded" ? "quota" : "feature_not_in_plan");
  // Pro : « illimité raisonnable » ; tous : pas plus de 20 messages par minute.
  const [perMinute, perDay] = await Promise.all([
    rateLimit("assistant-min", account.userId, 20, 60),
    pro ? rateLimit("assistant-day", account.userId, 300, 86_400) : Promise.resolve(true),
  ]);
  if (!perMinute || !perDay) return fail("rate_limited");

  const backend = assistantBackend();
  if (!backend) return fail("not_configured");

  const admin = createAdminClient();
  const supabase = await createClient();

  // Conversation : existante (à soi) ou nouvelle.
  let conversationId = input.conversationId;
  if (conversationId) {
    const { data } = await admin
      .from("ai_conversations")
      .select("id")
      .eq("id", conversationId)
      .eq("user_id", account.userId)
      .maybeSingle();
    if (!data) return fail("invalid", 404);
  } else {
    const { data } = await admin
      .from("ai_conversations")
      .insert({ user_id: account.userId, title: userText.slice(0, 80) })
      .select("id")
      .single();
    if (!data) return fail("server", 500);
    conversationId = data.id;
  }

  // Document joint : envoyé au modèle UNIQUEMENT à la demande de l'utilisateur (consentement).
  let ref: DocumentRef | null = null;
  if (input.documentId) {
    const { data: doc } = await supabase
      .from("documents")
      .select("id, title, pdf_path, page_count, trashed_at")
      .eq("id", input.documentId)
      .maybeSingle();
    if (!doc?.pdf_path || doc.trashed_at) return fail("invalid", 404);
    ref = {
      type: "document_ref",
      documentId: doc.id,
      path: doc.pdf_path,
      title: doc.title,
      pages: doc.page_count ?? 0,
    };
  }

  const remaining = access.ok ? ent.remaining.aiMessagesToday : 0;
  const text = `${contextBlock(account, input.path, remaining === null ? null : remaining - 1, locale)}\n\n${userText}`;
  const storedUser: (DocumentRef | Anthropic.Beta.BetaContentBlockParam)[] = [
    ...(ref ? [ref] : []),
    { type: "text", text },
  ];

  return ndjson(async (send) => {
    send({ type: "meta", conversationId: conversationId! });
    const actions: AssistantAction[] = [];
    const emit = (action: AssistantAction) => {
      actions.push(action);
      send({ type: "action", action });
    };

    // Questions fréquentes (suggestions, nouvelle conversation) : réponse en cache.
    const { count: previous } = await admin
      .from("ai_messages")
      .select("id", { count: "exact", head: true })
      .eq("conversation_id", conversationId!);
    const faqKey =
      input.suggestion && !ref && !previous
        ? `${backend.kind}:${locale}:${input.suggestion}:${pro ? "pro" : "essential"}`
        : null;
    if (faqKey) {
      const { data: cached } = await admin
        .from("ai_faq_cache")
        .select("answer, created_at, hits")
        .eq("key", faqKey)
        .maybeSingle();
      if (cached && Date.now() - new Date(cached.created_at).getTime() < FAQ_TTL_MS) {
        for (const chunk of cached.answer.match(/[\s\S]{1,24}/g) ?? [])
          send({ type: "text", delta: chunk });
        await admin
          .from("ai_faq_cache")
          .update({ hits: cached.hits + 1 })
          .eq("key", faqKey);
        await saveTurn(
          conversationId!,
          storedUser,
          [{ role: "assistant", content: [{ type: "text", text: cached.answer }] }],
          [],
          { in: 0, out: 0 },
        );
        send({ type: "done", remaining });
        return;
      }
    }

    const cache = new Map<string, Awaited<ReturnType<typeof loadDocument>>>();
    const ctx = {
      supabase,
      userId: account.userId,
      attachedDocumentId: ref?.documentId ?? null,
      emit,
    };
    // Le document joint le plus récent reste analysable dans la suite de la conversation.
    let lastRef: DocumentRef | null = null;
    if (!ref) {
      const { data: rows } = await admin
        .from("ai_messages")
        .select("content")
        .eq("conversation_id", conversationId!)
        .eq("role", "user")
        .order("created_at", { ascending: false })
        .limit(20);
      lastRef =
        (rows ?? [])
          .flatMap((r) => r.content as unknown as DocumentRef[])
          .find((b) => b?.type === "document_ref") ?? null;
      if (lastRef) {
        // Document joint plus tôt : seulement s'il est toujours accessible.
        const { data: still } = await supabase
          .from("documents")
          .select("id")
          .eq("id", lastRef.documentId)
          .is("trashed_at", null)
          .maybeSingle();
        if (still) ctx.attachedDocumentId = lastRef.documentId;
        else lastRef = null;
      }
    }
    let result: TurnResult;
    if (backend.kind === "mock") {
      const current = ref ?? lastRef;
      const doc = current ? await loadDocument(current.path) : null;
      result = await runMockTurn({
        userText,
        attached:
          current && doc
            ? { id: current.documentId, title: current.title, lines: doc.lines }
            : null,
        pro,
        send,
        emit,
      });
    } else {
      // Accès revérifié pour chaque document de l'historique (RLS, hors corbeille).
      const readable = new Map<string, boolean>();
      const canRead = async (documentId: string) => {
        if (!readable.has(documentId)) {
          const { data } = await supabase
            .from("documents")
            .select("id")
            .eq("id", documentId)
            .is("trashed_at", null)
            .maybeSingle();
          readable.set(documentId, Boolean(data));
        }
        return readable.get(documentId)!;
      };
      const history = await loadHistory(conversationId!, cache, canRead);
      const userContent: Anthropic.Beta.BetaContentBlockParam[] = [
        ...(ref ? await documentBlocks(ref, cache) : []),
        { type: "text", text },
      ];
      result = await runTurn({
        client: backend.client,
        history,
        userContent,
        tools: toolsFor(pro),
        ctx,
        effort: ref || input.quickAction ? "medium" : "low",
        send,
        signal: request.signal,
      });
    }

    await saveTurn(conversationId!, storedUser, result.appended, actions, {
      in: result.tokensIn,
      out: result.tokensOut,
    });
    await admin.rpc("increment_usage", {
      p_user_id: account.userId,
      p_kind: "ai_messages",
      p_amount: 1,
    });
    if (faqKey && !result.usedTools && result.text.trim()) {
      await admin.from("ai_faq_cache").upsert({
        key: faqKey,
        answer: result.text,
        hits: 0,
        created_at: new Date().toISOString(),
      });
    }
    send({ type: "done", remaining: remaining === null ? null : Math.max(0, remaining - 1) });
  });
}
