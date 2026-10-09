/**
 * Vérifications de mise en production : variables indispensables, modes de test
 * désactivés, adresses en HTTPS. Pures (aucun accès réseau) : utilisées par la route
 * /api/health et par `npm run deploy:check`.
 */
export type Check = { id: string; ok: boolean; level: "blocking" | "warning"; message: string };

type Env = Record<string, string | undefined>;

const set = (env: Env, key: string) => Boolean(env[key]?.trim());

export function productionChecks(env: Env): Check[] {
  const checks: Check[] = [];
  const add = (id: string, ok: boolean, message: string, level: Check["level"] = "blocking") =>
    checks.push({ id, ok, level, message });

  const appUrl = env.NEXT_PUBLIC_APP_URL ?? "";
  add(
    "app_url",
    appUrl.startsWith("https://") && !appUrl.endsWith("/"),
    "NEXT_PUBLIC_APP_URL : adresse https du site, sans / final",
  );
  add(
    "supabase_url",
    (env.NEXT_PUBLIC_SUPABASE_URL ?? "").startsWith("https://"),
    "NEXT_PUBLIC_SUPABASE_URL : projet Supabase de production (https)",
  );
  add(
    "supabase_keys",
    set(env, "NEXT_PUBLIC_SUPABASE_ANON_KEY") && set(env, "SUPABASE_SERVICE_ROLE_KEY"),
    "Clés Supabase (anon et service_role)",
  );
  add(
    "link_secret",
    (env.LINK_SECRET ?? "").length >= 32,
    "LINK_SECRET : au moins 32 caractères aléatoires (liens de signature)",
  );
  add(
    "cron_secret",
    (env.CRON_SECRET ?? "").length >= 16,
    "CRON_SECRET : secret des tâches planifiées Vercel",
  );
  add("email", set(env, "RESEND_API_KEY"), "RESEND_API_KEY : e-mails transactionnels (Resend)");
  add(
    "gotenberg",
    set(env, "GOTENBERG_URL") &&
      (env.GOTENBERG_URL ?? "").startsWith("https://") &&
      set(env, "GOTENBERG_TOKEN"),
    "GOTENBERG_URL (https) et GOTENBERG_TOKEN : conversion Word → PDF",
  );
  add("anthropic", set(env, "ANTHROPIC_API_KEY"), "ANTHROPIC_API_KEY : assistant IA");
  add(
    "notchpay",
    set(env, "NOTCHPAY_PUBLIC_KEY"),
    "NOTCHPAY_PUBLIC_KEY : paiements Mobile Money et carte (Notch Pay)",
  );
  add(
    "notchpay_webhook",
    set(env, "NOTCHPAY_WEBHOOK_SECRET"),
    "NOTCHPAY_WEBHOOK_SECRET : signature des notifications Notch Pay (recommandé)",
    "warning",
  );
  add(
    "payments_live",
    !(env.NOTCHPAY_PUBLIC_KEY ?? "").trim().startsWith("pk_test."),
    "NOTCHPAY_PUBLIC_KEY : clé de test, aucun paiement réel",
    "warning",
  );
  add("no_mock", env.AI_MOCK !== "true", "AI_MOCK doit être vide en production");
  add(
    "no_sandbox",
    env.PAYMENTS_SANDBOX !== "true",
    "PAYMENTS_SANDBOX doit être vide en production",
  );
  add(
    "sentry",
    set(env, "SENTRY_DSN"),
    "SENTRY_DSN : surveillance des erreurs (recommandé)",
    "warning",
  );
  return checks;
}

/**
 * Sous-ensemble bloquant à la compilation de production (scripts/build-guard.mjs) :
 * uniquement ce qui touche la sécurité. Les prestataires (e-mail, IA, paiement,
 * conversion) se dégradent proprement s'ils manquent et ne bloquent pas le déploiement.
 */
export function securityChecks(env: Env): Check[] {
  const ids = new Set(["supabase_url", "supabase_keys", "link_secret", "cron_secret", "no_mock"]);
  return productionChecks(env).filter((c) => ids.has(c.id));
}

export function summarize(checks: Check[]): {
  ready: boolean;
  blocking: Check[];
  warnings: Check[];
} {
  const blocking = checks.filter((c) => !c.ok && c.level === "blocking");
  const warnings = checks.filter((c) => !c.ok && c.level === "warning");
  return { ready: blocking.length === 0, blocking, warnings };
}
