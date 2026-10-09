/**
 * Vérifie qu'aucun secret n'est présent dans le code envoyé au navigateur (.next/static) :
 * noms des variables secrètes, formats de clés connus, jetons Supabase autres que « anon »,
 * et valeurs réelles des secrets de l'environnement courant. À lancer après `next build`.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = ".next/static";
const SECRET_NAMES = [
  "SUPABASE_SERVICE_ROLE_KEY",
  "ANTHROPIC_API_KEY",
  "ANTROPIC_API_KEY",
  "ANTHROPIC_WORKSPACE_ID",
  "NOTCHPAY_WEBHOOK_SECRET",
  "LINK_SECRET",
  "CRON_SECRET",
  "GOTENBERG_TOKEN",
  "RESEND_API_KEY",
  "SENTRY_DSN",
];
const KEY_PATTERNS: [string, RegExp][] = [
  ["clé Anthropic", /sk-ant-[A-Za-z0-9_-]{10,}/],
  ["clé Resend", /\bre_[A-Za-z0-9]{16,}_[A-Za-z0-9]{8,}/],
];

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? files(full) : [full];
  });
}

const problems: string[] = [];
const values = SECRET_NAMES.map((name) => process.env[name]?.trim()).filter(
  (v): v is string => !!v && v.length >= 12,
);

for (const file of files(ROOT).filter((f) => /\.(js|css|json|html|txt|map)$/.test(f))) {
  const text = readFileSync(file, "utf8");
  for (const name of SECRET_NAMES) if (text.includes(name)) problems.push(`${file} : ${name}`);
  for (const [label, re] of KEY_PATTERNS) if (re.test(text)) problems.push(`${file} : ${label}`);
  for (const value of values) if (text.includes(value)) problems.push(`${file} : valeur secrète`);
  for (const jwt of text.match(/eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+/g) ??
    []) {
    const payload = Buffer.from(jwt.split(".")[1]!, "base64url").toString("utf8");
    if (!payload.includes('"role":"anon"')) problems.push(`${file} : jeton non public`);
  }
}

if (problems.length) {
  console.error(`✗ Secrets trouvés dans le code envoyé au navigateur :\n${problems.join("\n")}`);
  process.exit(1);
}
console.log(`✓ Aucun secret dans ${ROOT} (${files(ROOT).length} fichiers analysés).`);
