/**
 * Affiche tout ce que Notch Pay renvoie sur une transaction (pour comprendre un échec) :
 *   npm run notchpay:inspect -- trx.xxxxxxxx [trx.yyyyyyyy …]
 * Lit NOTCHPAY_PUBLIC_KEY dans .env.local (jamais affichée). Les données personnelles
 * (nom, e-mail, téléphone, carte…) sont masquées avant affichage.
 */
const PERSONAL_KEYS = /customer|phone|email|name|card|number|account|pan|msisdn|address/i;

const key = process.env.NOTCHPAY_PUBLIC_KEY?.trim().replace(/^["']|["']$/g, "");
const refs = process.argv.slice(2);
if (!key) {
  console.error("NOTCHPAY_PUBLIC_KEY manquante : l'ajouter dans .env.local.");
  process.exit(1);
}
if (refs.length === 0) {
  console.error("Usage : npm run notchpay:inspect -- trx.xxxxxxxx");
  process.exit(1);
}
console.log(`Clé ${key.startsWith("pk_test.") ? "de TEST" : "de PRODUCTION"}\n`);

function mask(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(mask);
  if (!value || typeof value !== "object") {
    return typeof value === "string" ? value.replace(/\+?\d{8,}/g, "[numéro]") : value;
  }
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([k, v]) => [
      k,
      PERSONAL_KEYS.test(k) && v !== null && typeof v !== "object" ? "[masqué]" : mask(v),
    ]),
  );
}

for (const ref of refs) {
  if (!/^[A-Za-z0-9._-]{4,120}$/.test(ref)) {
    console.error(`Référence invalide : ${ref}`);
    continue;
  }
  const res = await fetch(`https://api.notchpay.co/payments/${encodeURIComponent(ref)}`, {
    headers: { Authorization: key, Accept: "application/json" },
    signal: AbortSignal.timeout(20_000),
  });
  const body = await res.json().catch(() => null);
  console.log(`── ${ref} (HTTP ${res.status})`);
  console.log(JSON.stringify(mask(body), null, 2), "\n");
}
