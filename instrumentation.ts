import type { Instrumentation } from "next";

/** Erreurs serveur (rendu, routes, actions, proxy) → Sentry, si SENTRY_DSN est défini. */
export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  if (!process.env.SENTRY_DSN || process.env.NEXT_RUNTIME !== "nodejs") return;
  const { reportError } = await import("@/lib/monitoring/sentry");
  await reportError(process.env.SENTRY_DSN, error, {
    path: request.path,
    method: request.method,
    route: context.routePath,
    routeType: context.routeType,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "development",
    release: process.env.VERCEL_GIT_COMMIT_SHA,
  });
};
