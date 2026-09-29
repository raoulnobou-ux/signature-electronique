import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { AssistantEvent } from "./events";
import { SYSTEM_PROMPT } from "./prompt";
import { runTool, type ToolContext, type TOOLS } from "./tools";

export const ASSISTANT_MODEL = "claude-opus-5-5";
/** Nombre maximal d'allers-retours outil → modèle par message de l'utilisateur. */
const MAX_STEPS = 6;

type MessageParam = Anthropic.Beta.BetaMessageParam;
type ToolDefs = typeof TOOLS;

export interface TurnInput {
  client: Anthropic;
  /** Historique complet (documents joints déjà réinsérés), sans le nouveau message. */
  history: MessageParam[];
  userContent: Anthropic.Beta.BetaContentBlockParam[];
  tools: ToolDefs;
  ctx: ToolContext;
  /** Essentiel : questions d'usage (effort bas) ; Pro avec document : analyse (effort moyen). */
  effort: "low" | "medium";
  send: (event: AssistantEvent) => void;
  signal?: AbortSignal;
}

export interface TurnResult {
  /** Messages à enregistrer après celui de l'utilisateur (réponses, résultats d'outils). */
  appended: MessageParam[];
  text: string;
  usedTools: boolean;
  tokensIn: number;
  tokensOut: number;
}

/**
 * Un tour de conversation : réponse en streaming, exécution des outils demandés (validés),
 * nouvelle requête avec leurs résultats, jusqu'à la réponse finale. Historique en ajout seul
 * (les blocs renvoyés par l'API sont réutilisés tels quels au tour suivant).
 */
export async function runTurn(input: TurnInput): Promise<TurnResult> {
  const { client, tools, ctx, send } = input;
  const messages: MessageParam[] = [...input.history, { role: "user", content: input.userContent }];
  const appended: MessageParam[] = [];
  let text = "";
  let usedTools = false;
  let tokensIn = 0;
  let tokensOut = 0;
  let jsonRetries = 0;

  for (let step = 0; step < MAX_STEPS; step++) {
    let message: Anthropic.Beta.BetaMessage;
    try {
      const stream = client.beta.messages.stream(
        {
          model: ASSISTANT_MODEL,
          max_tokens: 64000,
          // Instructions figées, mises en cache ; l'historique est mis en cache automatiquement.
          system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
          cache_control: { type: "ephemeral" },
          messages,
          tools: tools.map((t) => t.definition),
          tool_choice: { type: "auto" },
          output_config: { effort: input.effort },
          // Refus du classifieur de sécurité : l'API relance d'elle-même sur un modèle de repli.
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
        },
        { signal: input.signal },
      );
      if (step > 0 && text) send({ type: "text", delta: "\n\n" });
      for await (const event of stream) {
        if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
          text += event.delta.text;
          send({ type: "text", delta: event.delta.text });
        }
      }
      message = await stream.finalMessage();
    } catch (error) {
      // JSON d'outil illisible (flux des paramètres) : on relance la requête, une fois.
      if (
        !(error instanceof Anthropic.APIError) &&
        !(error instanceof Anthropic.APIUserAbortError) &&
        jsonRetries < 1 &&
        error instanceof SyntaxError
      ) {
        jsonRetries++;
        step--;
        continue;
      }
      throw error;
    }

    tokensIn +=
      message.usage.input_tokens +
      (message.usage.cache_read_input_tokens ?? 0) +
      (message.usage.cache_creation_input_tokens ?? 0);
    tokensOut += message.usage.output_tokens;
    const assistantMessage: MessageParam = {
      role: "assistant",
      content: message.content as Anthropic.Beta.BetaContentBlockParam[],
    };
    messages.push(assistantMessage);
    appended.push(assistantMessage);

    if (message.stop_reason === "refusal") {
      send({ type: "error", code: "refusal" });
      break;
    }
    const toolUses = message.content.filter(
      (b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use",
    );
    // Paramètres d'outil coupés par la limite de sortie : on n'exécute rien.
    if (message.stop_reason === "max_tokens" && toolUses.length) {
      send({ type: "error", code: "server" });
      break;
    }
    if (message.stop_reason !== "tool_use" || toolUses.length === 0) break;

    usedTools = true;
    // Tous les résultats dans UN message utilisateur (appels parallèles).
    const results = await Promise.all(
      toolUses.map(async (block) => {
        send({ type: "tool", name: block.name, status: "start" });
        const result = await runTool(tools, block.name, block.input, ctx);
        send({ type: "tool", name: block.name, status: "done" });
        return {
          type: "tool_result" as const,
          tool_use_id: block.id,
          content: result.content,
          is_error: result.isError,
        };
      }),
    );
    const toolMessage: MessageParam = { role: "user", content: results };
    messages.push(toolMessage);
    appended.push(toolMessage);
  }

  return { appended, text, usedTools, tokensIn, tokensOut };
}
