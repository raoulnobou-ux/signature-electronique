/**
 * Test rapide d'un déploiement (production ou préproduction) :
 *   npm run smoke -- https://quicksign.app
 * Avec CRON_SECRET dans l'environnement, affiche aussi le bilan de configuration.
 */
const base = (process.argv[2] ?? "http://localhost:3000").replace(/\/$/, "");
let failures = 0;

async function check(label: string, run: () => Promise<boolean | string>) {
  try {
    const result = await run();
    const ok = result === true;
    if (!ok) failures++;
    console.log(
      `${ok ? "✓" : "✗"} ${label}${ok ? "" : ` — ${result === false ? "échec" : result}`}`,
    );
  } catch (error) {
    failures++;
    console.log(`✗ ${label} — ${(error as Error).message}`);
  }
}

const get = (path: string, init?: RequestInit) =>
  fetch(base + path, { redirect: "manual", ...init });

await check("Accueil, tarifs, sécurité, connexion répondent", async () => {
  for (const path of ["/", "/tarifs", "/securite", "/connexion", "/verify"]) {
    const res = await get(path);
    if (res.status !== 200) return `${path} → ${res.status}`;
  }
  return true;
});
await check("En-têtes de sécurité (CSP à nonce, HSTS, X-Frame-Options)", async () => {
  const h = (await get("/")).headers;
  const csp = h.get("content-security-policy") ?? "";
  if (!/'nonce-/.test(csp)) return "CSP sans nonce";
  if (base.startsWith("https") && !h.get("strict-transport-security")) return "HSTS absent";
  return h.get("x-frame-options") === "DENY" || "X-Frame-Options absent";
});
await check("Espace connecté protégé (redirection vers /connexion)", async () => {
  const res = await get("/app");
  return (
    (res.status >= 300 &&
      res.status < 400 &&
      (res.headers.get("location") ?? "").includes("/connexion")) ||
    `statut ${res.status}`
  );
});
await check("Santé : base de données et conversion Word", async () => {
  const headers: Record<string, string> = process.env.CRON_SECRET
    ? { authorization: `Bearer ${process.env.CRON_SECRET}` }
    : {};
  const res = await get("/api/health", { headers });
  const body = (await res.json()) as {
    status: string;
    conversion: boolean | null;
    production?: { ready: boolean; blocking: string[]; warnings: string[] };
  };
  if (body.production) {
    for (const item of body.production.blocking) console.log(`    ✗ ${item}`);
    for (const item of body.production.warnings) console.log(`    ! ${item}`);
  }
  if (body.status !== "ok") return "base de données injoignable";
  if (body.conversion === false) return "Gotenberg injoignable";
  if (body.production && !body.production.ready) return "configuration incomplète";
  return true;
});
await check(
  "Tâches planifiées refusées sans secret",
  async () => (await get("/api/cron/billing")).status === 401,
);
await check("Webhook Notch Pay refuse une notification invalide", async () => {
  const res = await get("/api/webhooks/notchpay", { method: "POST", body: "{}" });
  return [401, 404].includes(res.status) || `statut ${res.status}`;
});
await check("Application installable (manifeste, icônes, service worker)", async () => {
  const manifest = (await (await get("/manifest.webmanifest")).json()) as {
    icons: { src: string }[];
  };
  for (const icon of manifest.icons)
    if ((await get(icon.src)).status !== 200) return `icône ${icon.src}`;
  return (await get("/sw.js")).status === 200 || "sw.js absent";
});

console.log(
  failures ? `\n${failures} vérification(s) en échec sur ${base}.` : `\nTout est bon sur ${base}.`,
);
process.exit(failures ? 1 : 0);

export {};
