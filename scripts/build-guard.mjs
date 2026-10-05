/**
 * Garde-fou de déploiement (lancé avant `next build`) : en production Vercel, la
 * compilation échoue si une variable critique pour la sécurité manque ou est mal réglée.
 * Un échec de compilation ne coupe pas le site : la version en ligne reste servie.
 * Hors production (développement, aperçus, CI), rien n'est bloqué.
 * Mêmes règles que securityChecks() dans lib/deploy/readiness.ts (testées).
 */
const env = process.env;
if (env.VERCEL_ENV !== "production") process.exit(0);

const set = (key) => Boolean(env[key]?.trim());
const checks = [
  [
    (env.NEXT_PUBLIC_SUPABASE_URL ?? "").startsWith("https://"),
    "NEXT_PUBLIC_SUPABASE_URL : projet Supabase de production (https)",
  ],
  [
    set("NEXT_PUBLIC_SUPABASE_ANON_KEY") && set("SUPABASE_SERVICE_ROLE_KEY"),
    "Clés Supabase (anon et service_role)",
  ],
  [(env.LINK_SECRET ?? "").length >= 32, "LINK_SECRET : au moins 32 caractères aléatoires"],
  [(env.CRON_SECRET ?? "").length >= 16, "CRON_SECRET : secret des tâches planifiées"],
  [env.AI_MOCK !== "true", "AI_MOCK doit être vide en production"],
];
const failed = checks.filter(([ok]) => !ok).map(([, message]) => message);
if (failed.length) {
  console.error("\n✗ Déploiement bloqué : configuration de sécurité incomplète\n");
  for (const message of failed) console.error(`  - ${message}`);
  console.error("\nRenseignez ces variables dans Vercel → Settings → Environment Variables.\n");
  process.exit(1);
}
console.log("✓ Variables de sécurité de production présentes.");
