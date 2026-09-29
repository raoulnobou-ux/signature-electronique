/**
 * Vérifie les variables de production avant de déployer :
 *   npm run deploy:check -- .env.production
 * (fichier obtenu par exemple avec `vercel env pull .env.production`).
 */
import { existsSync } from "node:fs";
import { productionChecks, summarize } from "../lib/deploy/readiness.ts";

const file = process.argv[2] ?? ".env.production";
if (existsSync(file)) process.loadEnvFile(file);
else console.warn(`(fichier ${file} introuvable : lecture des variables du shell)`);

const checks = productionChecks(process.env);
for (const c of checks)
  console.log(`${c.ok ? "✓" : c.level === "blocking" ? "✗" : "!"} ${c.message}`);
const { ready, blocking, warnings } = summarize(checks);
console.log(
  ready
    ? `\nPrêt pour la production${warnings.length ? ` (${warnings.length} recommandation(s))` : ""}.`
    : `\n${blocking.length} point(s) bloquant(s) avant la mise en ligne.`,
);
process.exit(ready ? 0 : 1);
