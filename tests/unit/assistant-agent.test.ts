import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it, vi } from "vitest";
import { ASSISTANT_MODEL, runTurn } from "@/lib/ai/agent";
import { toolsFor, type ToolContext } from "@/lib/ai/tools";
import type { AssistantEvent } from "@/lib/ai/events";

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));

type Msg = Partial<Anthropic.Beta.BetaMessage> & { content: Anthropic.Beta.BetaContentBlock[] };

/** Faux client : rejoue des réponses préparées et garde les requêtes envoyées. */
function fakeClient(responses: Msg[]) {
  const requests: Record<string, unknown>[] = [];
  const client = {
    beta: {
      messages: {
        stream: (params: Record<string, unknown>) => {
          requests.push(structuredClone(params));
          const msg = responses.shift()!;
          const full = {
            usage: { input_tokens: 10, output_tokens: 5 },
            stop_reason: "end_turn",
            ...msg,
          };
          return {
            async *[Symbol.asyncIterator]() {
              for (const block of full.content)
                if (block.type === "text")
                  yield {
                    type: "content_block_delta",
                    index: 0,
                    delta: { type: "text_delta", text: block.text },
                  };
            },
            finalMessage: async () => full,
          };
        },
      },
    },
  } as unknown as Anthropic;
  return { client, requests };
}

const ctx = (emit = vi.fn()): ToolContext => ({
  supabase: {} as ToolContext["supabase"],
  userId: "u",
  attachedDocumentId: null,
  emit,
});

describe("boucle de l'assistant", () => {
  it("exécute l'outil demandé, renvoie son résultat, puis diffuse la réponse finale", async () => {
    const { client, requests } = fakeClient([
      {
        stop_reason: "tool_use",
        content: [
          { type: "text", text: "Je vous montre.", citations: null },
          {
            type: "tool_use",
            id: "tu1",
            name: "show_in_app",
            input: { target: "import", label: "Ici" },
          },
        ] as Anthropic.Beta.BetaContentBlock[],
      },
      {
        content: [
          { type: "text", text: "Cliquez sur Importer.", citations: null },
        ] as Anthropic.Beta.BetaContentBlock[],
      },
    ]);
    const events: AssistantEvent[] = [];
    const emit = vi.fn();
    const result = await runTurn({
      client,
      history: [],
      userContent: [{ type: "text", text: "Comment importer ?" }],
      tools: toolsFor(false),
      ctx: ctx(emit),
      effort: "low",
      send: (e) => events.push(e),
    });

    expect(emit).toHaveBeenCalledWith({ kind: "highlight", target: "import", label: "Ici" });
    expect(result.text).toBe("Je vous montre.Cliquez sur Importer.");
    expect(result.usedTools).toBe(true);
    // Historique en ajout seul : réponse, résultats d'outils, réponse finale.
    expect(result.appended.map((m) => m.role)).toEqual(["assistant", "user", "assistant"]);
    expect(result.appended[1]!.content).toEqual([
      { type: "tool_result", tool_use_id: "tu1", content: expect.any(String), is_error: false },
    ]);
    expect(events.filter((e) => e.type === "tool")).toEqual([
      { type: "tool", name: "show_in_app", status: "start" },
      { type: "tool", name: "show_in_app", status: "done" },
    ]);

    const first = requests[0]!;
    expect(first).toMatchObject({
      model: ASSISTANT_MODEL,
      output_config: { effort: "low" },
      tool_choice: { type: "auto" },
      fallbacks: "default",
    });
    expect(first).not.toHaveProperty("thinking");
    expect((first.system as { cache_control?: unknown }[])[0]!.cache_control).toEqual({
      type: "ephemeral",
    });
    // La 2e requête reprend exactement la 1re, complétée (préfixe identique → cache).
    const second = requests[1]!.messages as unknown[];
    expect(second.slice(0, 1)).toEqual(first.messages);
    expect(second).toHaveLength(3);
  });

  it("refus du modèle : message d'erreur, aucun outil exécuté", async () => {
    const { client } = fakeClient([{ stop_reason: "refusal", content: [] }]);
    const events: AssistantEvent[] = [];
    const result = await runTurn({
      client,
      history: [],
      userContent: [{ type: "text", text: "…" }],
      tools: toolsFor(true),
      ctx: ctx(),
      effort: "low",
      send: (e) => events.push(e),
    });
    expect(events).toContainEqual({ type: "error", code: "refusal" });
    expect(result.usedTools).toBe(false);
  });

  it("paramètres d'outil coupés (limite de sortie) : rien n'est exécuté", async () => {
    const emit = vi.fn();
    const { client } = fakeClient([
      {
        stop_reason: "max_tokens",
        content: [
          { type: "tool_use", id: "t", name: "show_in_app", input: { target: "import" } },
        ] as Anthropic.Beta.BetaContentBlock[],
      },
    ]);
    const events: AssistantEvent[] = [];
    await runTurn({
      client,
      history: [],
      userContent: [{ type: "text", text: "…" }],
      tools: toolsFor(false),
      ctx: ctx(emit),
      effort: "low",
      send: (e) => events.push(e),
    });
    expect(emit).not.toHaveBeenCalled();
    expect(events).toContainEqual({ type: "error", code: "server" });
  });
});
