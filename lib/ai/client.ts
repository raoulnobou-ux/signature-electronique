import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { serverEnv } from "@/lib/env.server";

let client: Anthropic | null = null;

/**
 * Moteur de l'assistant : l'API Claude (clé serveur uniquement), sinon l'assistant simulé
 * en développement / tests (AI_MOCK=true, jamais en production Vercel), sinon indisponible.
 */
export function assistantBackend():
  { kind: "anthropic"; client: Anthropic } | { kind: "mock" } | null {
  if (serverEnv.ANTHROPIC_API_KEY) {
    client ??= new Anthropic({
      apiKey: serverEnv.ANTHROPIC_API_KEY,
      maxRetries: 2,
      timeout: 5 * 60 * 1000,
      defaultHeaders: serverEnv.ANTHROPIC_WORKSPACE_ID
        ? { "anthropic-workspace-id": serverEnv.ANTHROPIC_WORKSPACE_ID }
        : undefined,
    });
    return { kind: "anthropic", client };
  }
  if (serverEnv.AI_MOCK === "true" && serverEnv.VERCEL_ENV !== "production")
    return { kind: "mock" };
  return null;
}
