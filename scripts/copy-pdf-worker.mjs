// Copie dans public/ les fichiers d'exécution de pdf.js (worker, CMaps, polices standard),
// servis tels quels et mis en cache par le navigateur. Exécuté après `npm install`.
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const pkg = dirname(require.resolve("pdfjs-dist/package.json"));
const { version } = require("pdfjs-dist/package.json");
const target = join(process.cwd(), "public", "pdfjs", version);

if (existsSync(join(process.cwd(), "public", "pdfjs")))
  rmSync(join(process.cwd(), "public", "pdfjs"), { recursive: true });
mkdirSync(target, { recursive: true });
// Version « legacy » : compatible avec les navigateurs plus anciens (téléphones Android courants).
cpSync(join(pkg, "legacy", "build", "pdf.worker.min.mjs"), join(target, "pdf.worker.min.mjs"));
cpSync(join(pkg, "cmaps"), join(target, "cmaps"), { recursive: true });
cpSync(join(pkg, "standard_fonts"), join(target, "standard_fonts"), { recursive: true });
console.log(`pdf.js ${version} : fichiers copiés dans public/pdfjs/${version}`);
