import Anthropic from "@anthropic-ai/sdk";
import type { AssistantErrorCode } from "./events";

/** Cause lisible d'un échec de l'API Claude (clé, crédit, surcharge), sinon « server ». */
export function providerErrorCode(error: unknown): AssistantErrorCode {
  if (!(error instanceof Anthropic.APIError)) return "server";
  const status = error.status ?? 0;
  if (status === 401 || status === 403) return "provider_auth";
  if (status === 402 || /credit balance/i.test(error.message)) return "provider_billing";
  if (status === 429 || status === 529 || status >= 500) return "provider_unavailable";
  return "server";
}
