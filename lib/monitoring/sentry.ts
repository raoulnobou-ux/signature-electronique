/**
 * Envoi minimal d'erreurs serveur à Sentry (protocole « envelope »), sans SDK : aucune
 * dépendance lourde, aucune donnée personnelle (ni en-têtes, ni cookies, ni jetons).
 */
type Dsn = { endpoint: string; publicKey: string };

export function parseDsn(dsn: string | undefined): Dsn | null {
  if (!dsn) return null;
  try {
    const url = new URL(dsn);
    const projectId = url.pathname.replace(/^\//, "");
    if (!url.username || !projectId) return null;
    return {
      endpoint: `${url.protocol}//${url.host}/api/${projectId}/envelope/`,
      publicKey: url.username,
    };
  } catch {
    return null;
  }
}

/** Retire des chemins les jetons de signature, invitations et paramètres de requête. */
export function scrubPath(path: string): string {
  return path
    .split("?")[0]!
    .replace(/\/s\/[^/]+/, "/s/[jeton]")
    .replace(/\/invitation\/[^/]+/, "/invitation/[jeton]");
}

export function buildEnvelope(
  error: unknown,
  info: {
    path: string;
    method: string;
    route: string;
    routeType: string;
    environment: string;
    release?: string;
  },
): { eventId: string; body: string } {
  const eventId = crypto.randomUUID().replace(/-/g, "");
  const err = error instanceof Error ? error : new Error(String(error));
  const digest =
    typeof error === "object" && error && "digest" in error
      ? String((error as { digest: unknown }).digest)
      : undefined;
  const frames = (err.stack ?? "")
    .split("\n")
    .slice(1, 30)
    .map((line) => line.trim().replace(/^at /, ""))
    .reverse()
    .map((fn) => ({ function: fn.slice(0, 200) }));
  const event = {
    event_id: eventId,
    timestamp: Date.now() / 1000,
    platform: "node",
    level: "error",
    environment: info.environment,
    release: info.release,
    transaction: info.route,
    tags: { route_type: info.routeType, method: info.method, ...(digest ? { digest } : {}) },
    request: { url: scrubPath(info.path), method: info.method },
    exception: {
      values: [{ type: err.name, value: err.message.slice(0, 1000), stacktrace: { frames } }],
    },
  };
  const body = [
    JSON.stringify({ event_id: eventId, sent_at: new Date().toISOString() }),
    JSON.stringify({ type: "event" }),
    JSON.stringify(event),
  ].join("\n");
  return { eventId, body };
}

export async function reportError(
  dsn: string | undefined,
  error: unknown,
  info: Parameters<typeof buildEnvelope>[1],
) {
  const target = parseDsn(dsn);
  if (!target) return;
  const { body } = buildEnvelope(error, info);
  try {
    await fetch(target.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-sentry-envelope",
        "X-Sentry-Auth": `Sentry sentry_version=7, sentry_client=quicksign/1.0, sentry_key=${target.publicKey}`,
      },
      body,
      signal: AbortSignal.timeout(3000),
    });
  } catch {
    /* la surveillance ne doit jamais faire échouer une requête */
  }
}
